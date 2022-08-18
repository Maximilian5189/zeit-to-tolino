import "dotenv/config";
import express  from "express";
import basicAuth from "express-basic-auth";
import { run } from "./src/script.js";
const app = express();
const port = 3000;

app.use(basicAuth({
  challenge: true,
  users: { [process.env.USERNAME]: process.env.PASSWORD }
}))

app.get("/", async (req, res) => {
  try {
    await run();
  } catch (e) {
    console.log(e)
    res.status(500)
    res.send("Upload not successful.")
  }

  if (res.statusCode !== 500) {
    res.send("Uploaded")
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
