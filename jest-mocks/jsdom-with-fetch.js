/**
 * Custom Jest environment that extends jsdom and injects Node's native fetch
 * onto the global object so that jest.spyOn(global, "fetch") works in tests.
 *
 * Required because Jest 29 + jsdom sandboxes the environment and does not
 * automatically bridge Node v18+ built-in fetch into the jsdom global.
 */
const { TestEnvironment } = require("jest-environment-jsdom");

class JsdomWithFetch extends TestEnvironment {
  async setup() {
    await super.setup();
    // Bridge Node's globalThis.fetch (available since Node 18) into the jsdom sandbox.
    if (typeof globalThis.fetch === "function") {
      this.global.fetch = globalThis.fetch;
      this.global.Request = globalThis.Request;
      this.global.Response = globalThis.Response;
      this.global.Headers = globalThis.Headers;
    }
  }
}

module.exports = JsdomWithFetch;
