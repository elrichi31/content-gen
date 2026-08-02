const provider = process.env.CONTENT_GEN_AI_PROVIDER ?? "none";
const allowedProviders = new Set(["none", "openai"]);
const renderLimit = process.env.MAX_ACTIVE_RENDER_JOBS;

if (!allowedProviders.has(provider)) {
  throw new Error(
    `CONTENT_GEN_AI_PROVIDER debe ser uno de: ${[...allowedProviders].join(", ")}. Recibido: ${provider}.`,
  );
}

if (provider === "openai" && !process.env.OPENAI_API_KEY) {
  throw new Error(
    "Falta OPENAI_API_KEY: configúrala antes de usar CONTENT_GEN_AI_PROVIDER=openai.",
  );
}

if (renderLimit && (!/^\d+$/.test(renderLimit) || Number(renderLimit) < 1 || Number(renderLimit) > 10)) {
  throw new Error("MAX_ACTIVE_RENDER_JOBS debe ser un entero entre 1 y 10.");
}

console.log(
  JSON.stringify(
    {
      status: "ready",
      provider,
      integrations: {
        openai: provider === "openai" ? "enabled" : "disabled",
        unsplash: process.env.UNSPLASH_ACCESS_KEY ? "configured" : "not-configured",
        elevenlabs: process.env.ELEVENLABS_API_KEY ? "configured" : "not-configured",
      },
    },
    null,
    2,
  ),
);
