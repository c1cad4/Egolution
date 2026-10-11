const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
test("ROBOTCYB transaction uses the Egolution merchant, exact amount and memo", async () => {
  const context = { TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      require.resolve("../public/vendor/solana-web3.min.js"),
      "utf8",
    ),
    context,
  );
  const lib = context.solanaWeb3,
    { buildTransaction } = await import("../public/transaction.mjs"),
    { MERCHANT, CURRENCIES } = await import("../public/commerce.js");
  for (const [currency, c] of Object.entries(CURRENCIES)) {
    const quote = {
      wallet: "11111111111111111111111111111111",
      recipient: MERCHANT,
      mint: c.mint,
      tokenProgram: c.tokenProgram,
      decimals: c.decimals,
      raw: c.raw,
      currency,
      item: "glass",
      id: "ego-12345678-1234-1234-1234-123456789012",
      blockhash: "11111111111111111111111111111111",
    };
    const tx = buildTransaction(lib, quote);
    assert.equal(tx.feePayer.toString(), quote.wallet);
    assert.equal(
      new TextDecoder().decode(tx.instructions.at(-1).data),
      quote.id,
    );
    assert.ok(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
        .length > 100,
    );
    if (currency === "SOL") {
      assert.equal(tx.instructions[0].keys[1].pubkey.toString(), MERCHANT);
      assert.equal(
        new DataView(
          tx.instructions[0].data.buffer,
          tx.instructions[0].data.byteOffset,
        ).getBigUint64(4, true),
        BigInt(c.raw),
      );
    } else {
      assert.equal(tx.instructions.length, 3);
      assert.equal(tx.instructions[0].data[0], 1);
      assert.equal(tx.instructions[0].keys[2].pubkey.toString(), MERCHANT);
      const transfer = tx.instructions[1];
      assert.equal(transfer.keys[1].pubkey.toString(), c.mint);
      assert.equal(transfer.programId.toString(), c.tokenProgram);
      assert.equal(transfer.data[0], 12);
      assert.equal(
        new DataView(
          transfer.data.buffer,
          transfer.data.byteOffset,
        ).getBigUint64(1, true),
        BigInt(c.raw),
      );
      assert.equal(transfer.data[9], c.decimals);
    }
  }
});

test("foreign merchant, currency, price and Swarm quotes are rejected", async () => {
  const { buildTransaction } = await import("../public/transaction.mjs"),
    { MERCHANT, CURRENCIES } = await import("../public/commerce.js");
  const c = CURRENCIES.ROBOTCYB,
    q = {
      recipient: MERCHANT,
      currency: "ROBOTCYB",
      item: "glass",
      ...c,
      id: "ego-12345678-1234-1234-1234-123456789012",
    };
  for (const changes of [
    { recipient: "AHBz386tP36ZrABN7STzxV66u1f7CwnaqrFBnevb4ff8" },
    { currency: "SOL" },
    { raw: "1" },
    { id: "swarm-12345678-1234-1234-1234-123456789012" },
  ])
    assert.throws(
      () => buildTransaction({}, { ...q, ...changes }),
      /Invalid payment quote/,
    );
});
