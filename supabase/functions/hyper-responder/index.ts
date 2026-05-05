import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Copa 2026 <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ erro: 'JSON inválido' }), { status: 400, headers: corsHeaders });
  }

  // ===== RECUPERAR SENHA =====
  if (body.acao === 'recuperar_senha') {
    const email = (body.email as string || '').trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ erro: 'Email obrigatório' }), { headers: corsHeaders });
    }

    const { data: usuario, error: userErr } = await supabase
      .from('usuarios')
      .select('nome, email')
      .ilike('email', email)
      .single();

    if (userErr || !usuario) {
      return new Response(JSON.stringify({ erro: 'Email não encontrado. Verifique o email usado no pagamento.' }), { headers: corsHeaders });
    }

    // Gera senha temporária de 8 chars
    const novaSenha = Math.random().toString(36).slice(-8);

    await supabase.from('usuarios').update({ senha: novaSenha }).ilike('email', email);

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#0a0f1e;color:#fff;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#111827;border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,.1)">
    <h2 style="color:#FFD700;margin-top:0">🏆 Copa 2026 — Nova senha</h2>
    <p>Olá, <strong>${usuario.nome}</strong>!</p>
    <p>Sua senha temporária é:</p>
    <div style="background:#1e2d45;border-radius:8px;padding:16px;text-align:center;font-size:24px;font-weight:700;letter-spacing:4px;color:#FFD700;margin:16px 0">
      ${novaSenha}
    </div>
    <p style="font-size:13px;color:#9ca3af">Entre no app com seu usuário e essa senha. Você pode alterar a senha depois nas configurações.</p>
    <a href="https://albumcopa2026.app.br" style="display:block;background:#003087;color:#FFD700;text-align:center;padding:14px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">
      Acessar o Album →
    </a>
  </div>
</body>
</html>`;

    try {
      await sendEmail(email, 'Sua nova senha — Copa 2026', html);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    } catch (e) {
      console.error('Email error:', e);
      return new Response(JSON.stringify({ erro: 'Erro ao enviar email. Tente novamente.' }), { headers: corsHeaders });
    }
  }

  // ===== PAGAMENTO =====
  const { nome, email, cpf, metodo, token, installments, paymentMethodId } = body as Record<string, string>;

  if (!nome || !email || !cpf || !metodo) {
    return new Response(JSON.stringify({ erro: 'Campos obrigatórios faltando' }), { status: 400, headers: corsHeaders });
  }

  const paymentData: Record<string, unknown> = {
    transaction_amount: 5.90,
    description: 'Album Copa 2026 — Acesso vitalício',
    payment_method_id: metodo === 'pix' ? 'pix' : paymentMethodId,
    payer: {
      email,
      identification: { type: 'CPF', number: cpf.replace(/\D/g, '') },
    },
  };

  if (metodo === 'cartao') {
    paymentData.token = token;
    paymentData.installments = Number(installments) || 1;
  }

  const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `copa2026-${email}-${Date.now()}`,
    },
    body: JSON.stringify(paymentData),
  });

  const payment = await mpRes.json();

  if (payment.status === 'approved' || (metodo === 'pix' && payment.status === 'pending')) {
    // Criar conta se não existe
    const { data: existingUser } = await supabase
      .from('usuarios')
      .select('id')
      .ilike('email', email)
      .single();

    if (!existingUser) {
      const senhaGerada = Math.random().toString(36).slice(-8);
      const nomeUsuario = nome.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 100);

      await supabase.from('usuarios').insert({
        nome: nomeUsuario,
        email: email.toLowerCase(),
        senha: senhaGerada,
        premium: true,
        nome_definido: false,
      });

      // Email de boas-vindas
      const htmlBemVindo = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#0a0f1e;color:#fff;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#111827;border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,.1)">
    <h2 style="color:#FFD700;margin-top:0">🏆 Bem-vindo ao Copa 2026!</h2>
    <p>Olá, <strong>${nome}</strong>! Seu pagamento foi confirmado.</p>
    <p>Seus dados de acesso:</p>
    <div style="background:#1e2d45;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:4px 0"><strong>Usuário:</strong> ${nomeUsuario}</p>
      <p style="margin:4px 0"><strong>Senha:</strong> ${senhaGerada}</p>
    </div>
    <a href="https://albumcopa2026.app.br" style="display:block;background:#003087;color:#FFD700;text-align:center;padding:14px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">
      Acessar o Album →
    </a>
  </div>
</body>
</html>`;

      try {
        await sendEmail(email, 'Bem-vindo ao Copa 2026 — Seus dados de acesso', htmlBemVindo);
      } catch (e) {
        console.error('Email boas-vindas error:', e);
      }
    } else {
      // Marcar como premium se já existe
      await supabase.from('usuarios').update({ premium: true }).ilike('email', email);
    }
  }

  if (metodo === 'pix' && payment.point_of_interaction?.transaction_data) {
    return new Response(JSON.stringify({
      status: payment.status,
      pix_qr: payment.point_of_interaction.transaction_data.qr_code,
      pix_qr_base64: payment.point_of_interaction.transaction_data.qr_code_base64,
      payment_id: payment.id,
    }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    status: payment.status,
    status_detail: payment.status_detail,
    payment_id: payment.id,
    erro: payment.message || null,
  }), { headers: corsHeaders });
});
