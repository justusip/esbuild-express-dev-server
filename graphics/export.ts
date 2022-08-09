import fs from "fs";
import path from "path";

(async () => {
    const maps: { [key: string]: string } = {};

    const files = await fs.promises.readdir(__dirname);
    for (const file of files) {
        const ext = path.extname(file);
        const basename = path.basename(file, ext);
        if (ext !== ".svg")
            continue;
        const content = await fs.promises.readFile(path.join(__dirname, file));
        console.log(`${basename}: ${content}`);
        maps[basename] = content.toString("base64");
    }

    const output = `export default ${JSON.stringify(maps)};`;
    await fs.promises.writeFile(path.join(__dirname, "../src/graphics.ts"), output);
    console.log(`File wrote successfully.`);
})().then();