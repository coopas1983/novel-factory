const assert=require("assert");
const escapeHtml=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
assert.strictEqual(escapeHtml('<script>"x"&</script>'),"&lt;script&gt;&quot;x&quot;&amp;&lt;/script&gt;");
console.log("novelpia prepare safety helper PASS");
