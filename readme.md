# Automatically download Zeit newspaper and then upload to Tolino
## Node
Start with `cd node && npm start`  
Prerequisites:
- You must have a Zeit and a Tolino login. Include these in `node/.env` file as follows:
  ```
  ZEIT_EMAIL=ENTER_YOUR_EMAIL
  ZEIT_PW=ENTER_YOUR_PASSWORD
  TOLINO_EMAIL=ENTER_YOUR_EMAIL
  TOLINO_PW=ENTER_YOUR_PASSWORD
  ```
- `node/state` file with last edition you downloaded manually, e.g. if the upcoming edition is the 10th of this year, the file's whole content should only be the current edition: `9` 

## Deno
Currently work in progress