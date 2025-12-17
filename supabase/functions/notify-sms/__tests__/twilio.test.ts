import { assertValidTwilioConfig, sendTwilioSms, TwilioConfig } from '../twilio';

describe('sendTwilioSms', () => {
  const consoleSpy = () => ({ log: jest.fn() });

  it('logs stub payloads and avoids network calls when stubMode is enabled', async () => {
    const fetchSpy = jest.fn();
    const logger = consoleSpy();
    const config: TwilioConfig = { stubMode: true, stubRecipient: '+1999' };

    await sendTwilioSms('+1234', 'Hello there!', config, { console: logger, fetchImpl: fetchSpy });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      '[notify-sms] Stubbed Twilio send',
      JSON.stringify({ target: '+1999', originalTo: '+1234', preview: 'Hello there!' }),
    );
  });

  it('issues Twilio REST calls with the expected payload when stubMode is disabled', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    const body = 'New attendee joined';
    const config: TwilioConfig = {
      stubMode: false,
      accountSid: 'AC123',
      authToken: 'auth-token',
      fromNumber: '+1555000',
    };

    await sendTwilioSms('+1337', body, config, {
      fetchImpl: fetchSpy,
      btoaImpl: () => 'encoded',
    });

    const expectedBody = new URLSearchParams({ To: '+1337', From: '+1555000', Body: body }).toString();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic encoded',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: expectedBody,
      },
    );
  });

  it('propagates Twilio HTTP failures with status + body text', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'nope',
    });

    const config: TwilioConfig = {
      stubMode: false,
      accountSid: 'AC789',
      authToken: 'secret',
      fromNumber: '+1555123',
    };

    await expect(
      sendTwilioSms('+1444', 'Body', config, { fetchImpl: fetchSpy, btoaImpl: () => 'enc' })
    ).rejects.toThrow('Twilio error: 500 nope');
  });
});

describe('assertValidTwilioConfig', () => {
  it('throws when mandatory fields are missing in live mode', () => {
    expect(() => assertValidTwilioConfig({ stubMode: false })).toThrow('Twilio environment variables are missing');
  });

  it('allows stub configurations without Twilio credentials', () => {
    expect(() => assertValidTwilioConfig({ stubMode: true })).not.toThrow();
  });
});
