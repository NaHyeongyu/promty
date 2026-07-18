import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const functionPath = new URL("./promty-cloudfront-spa-rewrite.js", import.meta.url);
const source = readFileSync(functionPath, "utf8");
const context = vm.createContext({});
vm.runInContext(`${source}\nthis.rewrite = handler;`, context);

for (const route of ["/", "/about", "/docs/collector", "/project/example"]) {
  const request = { uri: route };
  assert.equal(context.rewrite({ request }).uri, "/index.html", route);
}

for (const asset of ["/promty.svg", "/assets/app.js", "/assets/app.css"]) {
  const request = { uri: asset };
  assert.equal(context.rewrite({ request }).uri, asset, asset);
}

const distributionPath = new URL("./promty-cloudfront-distribution.json", import.meta.url);
const distribution = JSON.parse(readFileSync(distributionPath, "utf8"));
assert.equal(distribution.HttpVersion, "http2and3");
assert.equal(distribution.CustomErrorResponses.Quantity, 0);
assert.equal(distribution.DefaultCacheBehavior.FunctionAssociations.Quantity, 1);

console.log("cloudfront_configuration=valid");
