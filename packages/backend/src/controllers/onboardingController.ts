import { Request, Response } from 'express';
import { db } from '../config/database';
import { sendWelcomeEmail } from '../config/email';
import { createCustomer, createSubscription } from '../config/stripe';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export async function onboarding(req: Request, res: Response) {
  try {
    const { name, email, password, companyName, cnpj, slug, priceId } = req.body;

    // Validacoes basicas
    if (!name || !email || !password || !companyName || !cnpj || !slug || !priceId) {
      return res.status(400).json({ error: 'Todos os campos sao obrigatorios' });
    }

    // Verifica se CNPJ ja existe
    const cnpjExists = await db.query(
      'SELECT id FROM "Tenant" WHERE cnpj = $1',
      [cnpj]
    );

    if (cnpjExists.rows[0]) {
      return res.status(400).json({ error: 'CNPJ ja cadastrado' });
    }

    // Verifica se slug ja existe
    const slugExists = await db.query(
      'SELECT id FROM "Tenant" WHERE slug = $1',
      [slug]
    );    

    if (slugExists.rows[0]) {
      return res.status(400).json({ error: 'Slug ja em uso' });
    }

    // Cria cliente no Stripe
    const customer = await createCustomer(email, companyName);

    // Cria assinatura no Stripe
    const subscription = await createSubscription(customer.id, priceId);

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Gera o ID do tenant antes de inserir
    const tenantId = crypto.randomUUID();

    // Seta tenant no contexto ANTES do INSERT
    await db.query('BEGIN');
    await db.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', tenantId]
    );

    // Cria tenant
    await db.query(
      `INSERT INTO "Tenant" (id, name, cnpj, slug, "createdAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      [tenantId, companyName, cnpj, slug]
    );

    // Cria usuario proprietario
    await db.query(
      `INSERT INTO "User" (id, "tenantId", name, email, password, role, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, 'owner', NOW(), NOW())`,
      [tenantId, name, email, hashedPassword]
    );

    await db.query('COMMIT');

    // Envia e-mail de boas vindas
    await sendWelcomeEmail(email, companyName, slug);

    return res.status(201).json({
      message: 'Conta criada com sucesso',
      tenantId,
      subscription: subscription.id,
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Erro no onboarding:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}