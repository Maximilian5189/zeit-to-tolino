import { run } from "./src/script.js";
import express  from "express";
const app = express();
const port = 3000;

app.get("/", async (req, res) => {
  try {
    await run();
  } catch (e) {
    res.statusCode(500)
    res.send("Upload not successful.")
  }
  res.send("Uploaded")
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
