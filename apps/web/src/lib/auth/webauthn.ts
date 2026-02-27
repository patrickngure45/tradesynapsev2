import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from "@simplewebauthn/server";

import { getPublicBaseUrlOrigin } from "@/lib/seo/publicBaseUrl";

function deriveRpIdFromOrigin(origin: string): string {
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost") return host;
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "localhost";
  }
}

function base64UrlEncode(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function uuidToBytes(uuid: string): Uint8Array<ArrayBuffer> {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    const bytes = new TextEncoder().encode(uuid);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Uint8Array(ab);
  }
  const ab = new ArrayBuffer(16);
  const out = new Uint8Array(ab);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function getWebAuthnConfig(): {
  rpName: string;
  rpId: string;
  origin: string;
} {
  const origin = (process.env.WEBAUTHN_ORIGIN ?? getPublicBaseUrlOrigin()).trim();
  const rpName = (process.env.WEBAUTHN_RP_NAME ?? "Coinwaka").trim() || "Coinwaka";
  const rpId = (process.env.WEBAUTHN_RP_ID ?? deriveRpIdFromOrigin(origin)).trim();
  return { rpName, rpId, origin };
}

export async function createRegistrationOptions(opts: {
  userId: string;
  userName: string;
  userDisplayName: string;
  excludeCredentialIds: Uint8Array[];
}) {
  const { rpName, rpId } = getWebAuthnConfig();

  return await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userID: uuidToBytes(opts.userId),
    userName: opts.userName,
    userDisplayName: opts.userDisplayName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: opts.excludeCredentialIds.map((id) => ({
      id: base64UrlEncode(id),
    })),
  });
}

export async function verifyRegistration(opts: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
}) {
  const { rpId, origin } = getWebAuthnConfig();
  return await verifyRegistrationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
  });
}

export async function createAuthenticationOptions(opts: {
  allowCredentialIds: Uint8Array[];
}) {
  const { rpId } = getWebAuthnConfig();

  return await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "required",
    allowCredentials: opts.allowCredentialIds.map((id) => ({
      id: base64UrlEncode(id),
    })),
  });
}

export async function verifyAuthentication(opts: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
  };
}) {
  const { rpId, origin } = getWebAuthnConfig();
  const credential: WebAuthnCredential = {
    id: opts.credential.id,
    publicKey: new Uint8Array(opts.credential.publicKey),
    counter: opts.credential.counter,
  };
  return await verifyAuthenticationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
    credential,
  });
}
