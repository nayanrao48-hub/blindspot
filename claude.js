const MAX_BODY = 120000;
const MAX_OUTPUT = 12000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 30);

const hits = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;

  let entry = hits.get(ip);

  if (!entry || now - entry.start > windowMs) {
    entry = {
      start: now,
      count: 0
    };

    hits.set(ip, entry);
  }

  entry.count++;

  return entry.count > RATE_LIMIT;
}

function sendError(res, status, code, message) {
  res.statusCode = status;
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.end(
    JSON.stringify({
      error: code,
      message
    })
  );
}

module.exports = async function handler(req, res) {

  const origin = process.env.ALLOWED_ORIGIN;

  if (origin) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin
    );
  }

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendError(
      res,
      405,
      "method_not_allowed",
      "POST required"
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return sendError(
      res,
      503,
      "sampling_disabled",
      "ANTHROPIC_API_KEY is not configured"
    );
  }

  const ip = getClientIp(req);

  if (rateLimited(ip)) {
    return sendError(
      res,
      429,
      "rate_limited",
      "Too many requests"
    );
  }

  try {

    let raw = "";

    for await (const chunk of req) {

      raw += chunk.toString();

      if (
        Buffer.byteLength(raw, "utf8") > MAX_BODY
      ) {
        return sendError(
          res,
          413,
          "prompt_too_large",
          "Request is too large"
        );
      }
    }

    const body = JSON.parse(raw || "{}");

    const input =
      typeof body.input === "string"
        ? body.input
        : "";

    if (!input.trim()) {
      return sendError(
        res,
        400,
        "invalid_request",
        "Missing input"
      );
    }

    const tier =
      body.tier === "quick"
        ? "quick"
        : "default";

    const model =
      tier === "quick"
        ? (
            process.env.MODEL_QUICK ||
            "claude-haiku-4-5-20251001"
          )
        : (
            process.env.MODEL_DEFAULT ||
            "claude-sonnet-5-5"
          );

    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",

        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },

        body: JSON.stringify({
          model,
          max_tokens: 5000,
          stream: true,

          messages: [
            {
              role: "user",
              content: input
            }
          ]
        })
      }
    );

    if (!response.ok) {

      const errorText = await response.text();

      console.error(
        "Anthropic API error:",
        response.status,
        errorText
      );

      return sendError(
        res,
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? "rate_limited"
          : "upstream_error",
        "Anthropic API request failed"
      );
    }

    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    const reader =
      response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";
    let outputLength = 0;

    while (true) {

      const {
        done,
        value
      } = await reader.read();

      if (done) break;

      buffer += decoder.decode(
        value,
        { stream: true }
      );

      const events =
        buffer.split("\n\n");

      buffer =
        events.pop() || "";

      for (const event of events) {

        const lines =
          event.split("\n");

        let data = "";

        for (const line of lines) {

          if (line.startsWith("data:")) {
            data += line
              .slice(5)
              .trim();
          }
        }

        if (!data) continue;

        try {

          const parsed =
            JSON.parse(data);

          if (
            parsed.type ===
              "content_block_delta" &&
            parsed.delta &&
            parsed.delta.type ===
              "text_delta"
          ) {

            const text =
              parsed.delta.text || "";

            if (!text) continue;

            outputLength +=
              text.length;

            if (
              outputLength >
              MAX_OUTPUT
            ) {
              reader.cancel();
              break;
            }

            res.write(text);
          }

        } catch {
          // Ignore malformed SSE chunks
        }
      }
    }

    return res.end();

  } catch (error) {

    console.error(
      "Claude proxy error:",
      error
    );

    if (!res.headersSent) {

      return sendError(
        res,
        500,
        "upstream_error",
        "Unable to complete the request"
      );
    }

    res.end();
  }
};
