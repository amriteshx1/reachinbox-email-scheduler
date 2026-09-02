import http from "node:http";

export type HttpCatcher = {
  url: string;
  bodies: string[];
  close: () => Promise<void>;
};

export async function startHttpCatcher(statusCode = 200): Promise<HttpCatcher> {
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      bodies.push(Buffer.concat(chunks).toString("utf8"));
      res.statusCode = statusCode;
      res.end("ok");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("http catcher failed to bind");
  }

  return {
    url: `http://127.0.0.1:${address.port}/webhook`,
    bodies,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
