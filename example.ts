import { Model } from "./src/index.js";

async function main() {
  const model = new Model();

  try {
    const reply = await model.ask("你好！1+1 等于几？");
    console.log("回复:", reply);
  } catch (err) {
    console.error("调用失败:", err instanceof Error ? err.message : err);
  }
}

main();
