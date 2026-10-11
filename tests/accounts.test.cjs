const test = require("node:test"),
  assert = require("node:assert/strict");
const recipient = "ARxc7VD9vXBWLtrRxEGyM3cwRPmqxcWu6s9gjgUvzwwP",
  payer = "11111111111111111111111111111111";
function encode58(a) {
  const abc = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const b of a) n = n * 256n + BigInt(b);
  let s = "";
  while (n) {
    s = abc[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of a) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}
class Store {
  constructor() {
    this.map = new Map();
    this.tail = Promise.resolve();
  }
  async get(k) {
    return structuredClone(this.map.get(k));
  }
  async put(k, v) {
    this.map.set(k, structuredClone(v));
  }
  async delete(k) {
    for (const key of Array.isArray(k) ? k : [k]) this.map.delete(key);
  }
  async setAlarm() {}
  async list({ prefix }) {
    return new Map([...this.map].filter(([k]) => k.startsWith(prefix)));
  }
  transaction(fn) {
    const result = this.tail.then(() => fn(this));
    this.tail = result.catch(() => {});
    return result;
  }
}
test("real wallet signature rejects forgery and replay; inventory persists and equip requires ownership", async () => {
  const { Accounts } = await import("../server/accounts.js"),
    storage = new Store(),
    a = new Accounts({ storage }, {});
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ]),
    address = encode58(
      new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey)),
    );
  const request = (path, body, token) =>
    a.fetch(
      new Request("https://test" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  let response = await request("/api/challenge", { wallet: address });
  assert.equal(response.status, 200);
  const challenge = await response.json();
  response = await request("/api/login", {
    id: challenge.id,
    signature: Buffer.alloc(64).toString("base64"),
  });
  assert.equal(response.status, 401);
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "Ed25519",
      keys.privateKey,
      new TextEncoder().encode(challenge.message),
    ),
  ).toString("base64");
  response = await request("/api/login", { id: challenge.id, signature });
  assert.equal(response.status, 200);
  const login = await response.json();
  response = await request("/api/login", { id: challenge.id, signature });
  assert.equal(response.status, 401);
  response = await request("/api/equip", { item: "galaxy" }, login.token);
  assert.equal(response.status, 403);
  await storage.put("wallet:" + address, { owned: ["glass"], equipped: null });
  response = await request("/api/equip", { item: "glass" }, login.token);
  assert.equal(response.status, 200);
  response = await new Accounts({ storage }, {}).fetch(
    new Request("https://test/api/me", {
      headers: { Authorization: "Bearer " + login.token },
    }),
  );
  assert.equal((await response.json()).equipped, "glass");
});
test("verified receipts require success, payer, memo, exact mint, merchant and sufficient amount; one receipt cannot unlock twice", async () => {
  const { Accounts } = await import("../server/accounts.js"),
    { CURRENCIES, verifyPayment } = await import("../public/commerce.js"),
    storage = new Store(),
    a = new Accounts({ storage }, {}),
    token = crypto.randomUUID() + crypto.randomUUID(),
    signature = encode58(new Uint8Array(64).fill(17));
  await storage.put("session:" + token, {
    wallet: payer,
    expires: Date.now() + 10000,
  });
  const now = Date.now(),
    q = {
      id: "ego-one",
      wallet: payer,
      item: "glass",
      currency: "ROBOTCYB",
      raw: "1000000000",
      created: now - 5000,
      expires: now + 300000,
    };
  await storage.put("quote:" + q.id, q);
  function tx() {
    return {
      blockTime: Math.floor(now / 1000),
      transaction: {
        message: {
          accountKeys: [{ pubkey: payer, signer: true }],
          instructions: [{ program: "spl-memo", parsed: q.id }],
        },
      },
      meta: {
        err: null,
        preTokenBalances: [
          {
            mint: CURRENCIES.ROBOTCYB.mint,
            owner: payer,
            uiTokenAmount: { amount: q.raw, decimals: 6 },
          },
        ],
        postTokenBalances: [
          {
            mint: CURRENCIES.ROBOTCYB.mint,
            owner: recipient,
            uiTokenAmount: { amount: q.raw, decimals: 6 },
          },
        ],
      },
    };
  }
  assert.ok(verifyPayment(tx(), q));
  let bad = tx();
  bad.meta.err = { InstructionError: [1, "bad"] };
  assert.equal(verifyPayment(bad, q), false);
  bad = tx();
  bad.transaction.message.instructions = [];
  assert.equal(verifyPayment(bad, q), false);
  bad = tx();
  bad.meta.postTokenBalances[0].owner = payer;
  assert.equal(verifyPayment(bad, q), false);
  bad = tx();
  bad.meta.postTokenBalances[0].mint =
    "9QLCEL7Xo9VTwgBeAYU1PWX7JJ8joKxQCYw3msjUpump";
  assert.equal(verifyPayment(bad, q), false);
  bad = tx();
  bad.meta.postTokenBalances[0].uiTokenAmount.amount = "999";
  assert.equal(verifyPayment(bad, q), false);
  bad = tx();
  bad.transaction.message.accountKeys[0].signer = false;
  assert.equal(verifyPayment(bad, q), false);
  bad = tx();
  bad.blockTime = 1;
  assert.equal(verifyPayment(bad, q), false);
  a.rpc = async () => tx();
  const req = (id) =>
    a.fetch(
      new Request("https://test/api/claim", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: JSON.stringify({ id, signature }),
      }),
    );
  const responses = await Promise.all([req(q.id), req(q.id)]);
  assert.ok(responses.some((r) => r.status === 200));
  assert.deepEqual((await storage.get("wallet:" + payer)).owned, ["glass"]);
  const q2 = { ...q, id: "ego-two", item: "galaxy" };
  await storage.put("quote:" + q2.id, q2);
  q.id = q2.id;
  const reused = await req(q2.id);
  assert.equal(reused.status, 409);
  assert.deepEqual((await storage.get("wallet:" + payer)).owned, ["glass"]);
});
test("RPC falls back after a provider rejects indexed requests; unavailable providers never verify payment", async () => {
  const { Accounts } = await import("../server/accounts.js"),
    a = new Accounts({ storage: new Store() }, {}),
    oldFetch = global.fetch;
  let calls = [];
  try {
    global.fetch = async (url) => {
      calls.push(url);
      return calls.length === 1
        ? Response.json({ error: { message: "requires key" } })
        : Response.json({ result: { value: { decimals: 6 } } });
    };
    assert.equal((await a.rpc("getTokenSupply", [])).value.decimals, 6);
    assert.equal(calls.length, 2);
    global.fetch = async () =>
      Response.json({ error: { message: "unavailable" } });
    await assert.rejects(() => a.rpc("getTransaction", []), /unavailable/);
  } finally {
    global.fetch = oldFetch;
  }
});
test("real checkout is guarded until a dedicated RPC secret is configured", async () => {
  const { Accounts } = await import("../server/accounts.js"),
    storage = new Store(),
    token = crypto.randomUUID() + crypto.randomUUID();
  await storage.put("session:" + token, {
    wallet: payer,
    expires: Date.now() + 10000,
  });
  const a = new Accounts({ storage }, {});
  const r = await a.fetch(
    new Request("https://test/api/quote", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({ item: "glass", currency: "ROBOTCYB" }),
    }),
  );
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /No payment sent/);
  assert.equal((await storage.list({ prefix: "quote:" })).size, 0);
});
test("Egolution account storage and quotes are isolated from Swarm", async () => {
  const { Accounts } = await import("../server/accounts.js"),
    storage = new Store(),
    swarmStorage = new Store(),
    token = crypto.randomUUID() + crypto.randomUUID();
  await storage.put("session:" + token, {
    wallet: payer,
    expires: Date.now() + 10000,
  });
  const a = new Accounts({ storage }, { SOLANA_RPC_URL: "https://rpc.test" }),
    other = new Accounts({ storage: swarmStorage }, {});
  a.rpc = async (method) =>
    method === "getAccountInfo"
      ? {
          value: {
            owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            data: { parsed: { type: "mint", info: { decimals: 6 } } },
          },
        }
      : { value: { blockhash: payer, lastValidBlockHeight: 100 } };
  const request = (item, currency) =>
    new Request("https://test/api/quote", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({ item, currency }),
    });
  assert.equal(
    (
      await other.fetch(
        new Request("https://test/api/me", {
          headers: { Authorization: "Bearer " + token },
        }),
      )
    ).status,
    401,
  );
  for (const currency of ["SOL", "CICADAFARM"])
    assert.equal((await a.fetch(request("glass", currency))).status, 400);
  const r = await a.fetch(request("galaxy", "ROBOTCYB"));
  assert.equal(r.status, 200);
  const q = await r.json();
  assert.equal(q.recipient, recipient);
  assert.equal(q.raw, "2000000000");
  assert.match(q.id, /^ego-/);
});
