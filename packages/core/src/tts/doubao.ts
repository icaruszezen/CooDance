import crypto from 'node:crypto';

export interface DoubaoTtsParams {
  text: string;
  appId: string;
  accessToken: string;
  resourceId?: string;
  voiceType?: string;
  speedRatio?: number;
  endpoint?: string;
  encoding?: 'mp3' | 'wav';
}

export interface TtsSynthesisOutput {
  audioBuffer: Buffer;
  extension: 'mp3' | 'wav';
}

/**
 * Volcengine Doubao TTS 2.0 (`seed-tts-2.0`) HTTP client.
 * Supports:
 * - v3 unidirectional endpoint: `https://openspeech.bytedance.com/api/v3/tts/unidirectional`
 * - v1 REST endpoint: `https://openspeech.bytedance.com/api/v1/tts`
 */
export async function synthesizeWithDoubao(
  params: DoubaoTtsParams,
): Promise<TtsSynthesisOutput> {
  const appId = params.appId?.trim();
  const accessToken = params.accessToken?.trim();
  if (!appId || !accessToken) {
    throw new Error(
      'Volcengine Doubao TTS 2.0 credentials missing: please configure AppID and AccessToken in Settings or env (VOLC_TTS_APP_ID / VOLC_TTS_ACCESS_TOKEN).',
    );
  }

  const endpoint =
    params.endpoint?.trim() || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
  const voiceType = params.voiceType?.trim() || 'zh_female_vv_uranus_bigtts';
  const resourceId = params.resourceId?.trim() || 'seed-tts-2.0';
  const format = params.encoding || 'mp3';
  const speedRatio = params.speedRatio ?? 1.0;

  if (endpoint.includes('/api/v1/tts')) {
    const reqBody = {
      app: {
        appid: appId,
        token: accessToken,
        cluster: resourceId,
      },
      user: {
        uid: 'coodance-studio',
      },
      audio: {
        voice_type: voiceType,
        encoding: format,
        speed_ratio: speedRatio,
      },
      request: {
        reqid: crypto.randomUUID(),
        text: params.text,
        operation: 'query',
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer;${accessToken}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Doubao TTS v1 HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { code?: number; message?: string; data?: string };
    if (!json.data) {
      throw new Error(`Doubao TTS v1 error (${json.code ?? 'unknown'}): ${json.message ?? 'empty audio'}`);
    }
    return {
      audioBuffer: Buffer.from(json.data, 'base64'),
      extension: format,
    };
  }

  // Default: Volcengine Seed-TTS 2.0 v3 unidirectional JSON-stream endpoint
  const speechRate = Math.round((speedRatio - 1) * 100);
  const v3Body = {
    user: {
      uid: 'coodance-studio',
    },
    req_params: {
      text: params.text,
      speaker: voiceType,
      audio_params: {
        format,
        sample_rate: 24000,
        speech_rate: Math.max(-50, Math.min(100, speechRate)),
      },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Id': appId,
      'X-Api-Access-Key': accessToken,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify(v3Body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Doubao TTS 2.0 HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const rawText = await res.text();
  const chunks: Buffer[] = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { code?: number; message?: string; data?: string };
      if (parsed.code && parsed.code !== 0 && parsed.code !== 20000000) {
        throw new Error(`Doubao TTS 2.0 error ${parsed.code}: ${parsed.message ?? 'failed'}`);
      }
      if (parsed.data) {
        chunks.push(Buffer.from(parsed.data, 'base64'));
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        continue;
      }
      throw err;
    }
  }

  if (chunks.length === 0) {
    throw new Error('Doubao TTS 2.0 returned no audio frames.');
  }

  return {
    audioBuffer: Buffer.concat(chunks),
    extension: format,
  };
}
