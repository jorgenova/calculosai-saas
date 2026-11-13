import { Request, Response } from 'express';
import { db, setDatabaseContext, withTransaction } from '../config/database';
import { sendWelcomeEmail } from '../config/email';
import { createCustomer, createSubscription } from '../config/stripe';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { isValidCnpj, normalizeTaxId } from '../domain/taxIdentification';

export async function onboarding(req: Request, res: Response) {
  try {
    const { name, email, password, companyName, accountName, cnpj, slug, priceId } = req.body;

    // Basic validation.
    if (!name || !email || !password || !companyName || !cnpj || !slug || !priceId) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const normalizedCnpj = normalizeTaxId(String(cnpj));
    if (!isValidCnpj(normalizedCnpj)) {
      return res.status(400).json({ error: 'CNPJ is invalid' });
    }

    // Check whether the slug already exists.
    const slugExists = await db.query(
      'SELECT id FROM tenants WHERE slug = $1',
      [slug]
    );    

    if (slugExists.rows[0]) {
      return res.status(400).json({ error: 'Slug is already in use' });
    }

    // Hash the password.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate the account identifiers before opening the scoped transaction.
    const tenantId = crypto.randomUUID();
    const ownerId = crypto.randomUUID();

    await withTransaction(async (client) => {
      await setDatabaseContext(client, {
        tenantId,
        userId: ownerId,
        role: 'owner',
      });

      await client.query(
        `INSERT INTO tenants (id, name, slug, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [tenantId, accountName || companyName, slug]
      );

      await client.query(
        `INSERT INTO offices (id, tenant_id, name, cnpj, created_at, updated_at)
         VALUES (gen_random_uuid()::TEXT, $1, $2, $3, NOW(), NOW())`,
        [tenantId, companyName, normalizedCnpj]
      );

      await client.query(
        `INSERT INTO users (id, tenant_id, name, email, password, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'owner', NOW(), NOW())`,
        [ownerId, tenantId, name, email, hashedPassword]
      );
    });

    // From here the tenant exists and the 201 response is guaranteed. Stripe and
    // email are best effort: failures must not undo registration or return a 500.
    try {
      const customer = await createCustomer(email, companyName);
      const subscription = await createSubscription(customer.id, priceId);

      await withTransaction(async (client) => {
        await setDatabaseContext(client, { tenantId, userId: ownerId, role: 'owner' });
        await client.query(
          `UPDATE tenants SET stripe_customer_id = $1, stripe_subscription_id = $2
           WHERE id = $3`,
          [customer.id, subscription.id, tenantId]
        );
      });
    } catch (stripeErr) {
      console.error('Failed to request the Stripe subscription (tenant remains pending_payment):', stripeErr);
    }

    try {
      await sendWelcomeEmail(email, companyName, slug);
    } catch (emailErr) {
      console.error('Failed to send the welcome email:', emailErr);
    }

    return res.status(201).json({
      message: 'Account created successfully',
      tenantId,
    });

  } catch (err: any) {
    console.error('Onboarding failed:', err);
    if (err?.code === '23505') {
      return res.status(400).json({ error: 'Slug or CNPJ is already registered' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
