import { Resend } from 'resend';
import {
  exposeMockInviteToken,
  externalServicesMocked,
} from './externalServices';

const resend = externalServicesMocked
  ? null
  : new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(to: string, tenantName: string, slug: string) {
  if (externalServicesMocked) {
    console.log(`[mock] E-mail de boas-vindas para ${to} (${tenantName}, slug: ${slug})`);
    return;
  }

  if (!resend) throw new Error('Cliente Resend nao configurado');

  await resend.emails.send({
    from: 'noreply@seudominio.com.br',
    to,
    subject: `Bem-vindo ao ${tenantName}!`,
    html: `
      <h1>Bem-vindo, ${tenantName}!</h1>
      <p>Sua conta foi criada com sucesso.</p>
      <p>Acesse sua plataforma em: <a href="https://${slug}.seudominio.com.br">https://${slug}.seudominio.com.br</a></p>
    `,
  });
}

export async function sendInviteEmail(to: string, tenantName: string, slug: string, token: string) {
  if (externalServicesMocked) {
    if (exposeMockInviteToken) {
      console.log(
        `[mock] Convite para ${to}: http://localhost:5173/convite?token=${token} ` +
        `(tenant: ${tenantName}, slug: ${slug})`
      );
    } else {
      console.log(
        `[mock] Convite simulado para ${to} (tenant: ${tenantName}, slug: ${slug}; token oculto)`
      );
    }
    return;
  }

  if (!resend) throw new Error('Cliente Resend nao configurado');

  await resend.emails.send({
    from: 'noreply@seudominio.com.br',
    to,
    subject: `Voce foi convidado para ${tenantName}`,
    html: `
      <h1>Voce foi convidado!</h1>
      <p>Voce foi convidado para acessar ${tenantName}.</p>
      <p>Clique no link para aceitar o convite:</p>
      <a href="https://${slug}.seudominio.com.br/convite?token=${token}">Aceitar convite</a>
    `,
  });
}
