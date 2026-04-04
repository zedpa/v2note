/**
 * 邮件发送服务（Resend）
 */

let resendClient: any = null;

async function getResend() {
  if (!resendClient) {
    const { Resend } = await import("resend");
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.EMAIL_FROM ?? "念念有路 <noreply@v2note.com>";

/** 发送验证码邮件 */
export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const resend = await getResend();
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "您的验证码",
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">念念有路</h2>
        <p>您的验证码是：</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a; margin: 20px 0;">
          ${code}
        </p>
        <p style="color: #666; font-size: 14px;">验证码 5 分钟内有效，请勿泄露给他人。</p>
      </div>
    `,
  });
}

/** 生成 6 位随机数字验证码 */
export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
