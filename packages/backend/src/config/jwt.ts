import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const ALGORITHM = 'HS256';

export async function signToken(payload: {
  userId: string;
  tenantId: string;
  role: 'owner' | 'attendant';
}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: [ALGORITHM],
  });
  return payload;
}