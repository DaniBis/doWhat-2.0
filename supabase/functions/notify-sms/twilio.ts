export type TwilioConfig = {
  stubMode: boolean;
  stubRecipient?: string | null;
  accountSid?: string | null;
  authToken?: string | null;
  fromNumber?: string | null;
};

export type TwilioDeps = {
  fetchImpl?: typeof fetch;
  console?: Pick<typeof console, "log">;
  btoaImpl?: (value: string) => string;
};

const PREVIEW_LIMIT = 120;

const resolveBtoa = (deps?: TwilioDeps) => {
  if (deps?.btoaImpl) {
    return deps.btoaImpl;
  }
  if (typeof btoa === "function") {
    return btoa;
  }
  throw new Error("btoa is not available");
};

const buildPreview = (body: string) => body.slice(0, PREVIEW_LIMIT);

const formatStubPayload = (target: string, originalTo: string, body: string) =>
  JSON.stringify({ target, originalTo, preview: buildPreview(body) });

export function assertValidTwilioConfig(config: TwilioConfig): void {
  if (config.stubMode) {
    return;
  }

  if (!config.accountSid || !config.authToken || !config.fromNumber) {
    throw new Error("Twilio environment variables are missing");
  }
}

export async function sendTwilioSms(
  to: string,
  body: string,
  config: TwilioConfig,
  deps: TwilioDeps = {}
): Promise<void> {
  const consoleImpl = deps.console ?? console;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const btoaImpl = resolveBtoa(deps);

  if (config.stubMode) {
    const target = config.stubRecipient?.trim() || to;
    consoleImpl.log("[notify-sms] Stubbed Twilio send", formatStubPayload(target, to, body));
    return;
  }

  assertValidTwilioConfig(config);

  const auth = btoaImpl(`${config.accountSid}:${config.authToken}`);
  const params = new URLSearchParams({ To: to, From: config.fromNumber!, Body: body });
  const response = await fetchImpl(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio error: ${response.status} ${errorText}`);
  }
}
