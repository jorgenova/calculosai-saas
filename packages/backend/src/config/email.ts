import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(to: string, tenantName: string, slug: string) {
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