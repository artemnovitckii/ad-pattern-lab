import { copyFile, constants } from "node:fs/promises";
try {
  await copyFile(".env.example", ".env", constants.COPYFILE_EXCL);
  console.log(
    "Created .env. Demo needs no keys. Add provider keys only for the features you want.",
  );
} catch (e) {
  if (e.code === "EEXIST") console.log(".env already exists; left unchanged.");
  else throw e;
}
