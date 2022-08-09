import fs from "fs";
import path from "path";
import express from "express";
import {build, BuildFailure, BuildOptions, BuildResult} from "esbuild";
import chokidar from "chokidar";

import graphics from "./graphics";

const clients: express.Response[] = [];
const files: { [key: string]: Uint8Array } = {};
const injection = `
<script>
window.addEventListener("load", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.classList.add("devserver-injection");

    container.innerHTML = "<img style='position: absolute; left: 50%; top: 50%; display: none; transition: all .5s linear; z-index: 999999; transform: translate(-50%, -50%); width: 200px;'></img>";
    // container.innerHTML = "<div style='position: absolute; left: 50%; top: 50%; background: rgba(0, 0, 0, .5); padding: 8px 16px; color: white; border-radius: 4px; display: none; transition: all .5s linear; z-index: 999999; transform: translate(-50%, -50%); text-align: center;'></div>";
    const element = container.children[0];

    const display = (graphics, fadeOut) => {
        element.style["display"] = "block";
        element.style["opacity"] = "1";
        // element.innerText = message;
        element.setAttribute("src", "data:image/svg+xml;base64," + graphics);
        if (fadeOut) {
            setTimeout(() => {
                element.style["opacity"] = "0";
            }, 500);
            setTimeout(() => {
                element.style["display"] = "none";
            }, 1000);
        }
    };

    let wasDisconnected = false;
    const reload = () => {
        display("${graphics.DialogReloading}", false);
        location.reload();
    };
    while (true) {
        const es = new EventSource("/needreload");
        es.onmessage = e => {
            switch (e.data) {
                case "ok":
                    reload();
                    break;
                case "failed":
                    display("${graphics.DialogFailed}", true);
                    break;
            }
        };
        es.onopen = () => {
            if (wasDisconnected) {
                wasDisconnected = false;
                reload();
            }
        };
        await new Promise(resolve => es.onerror = resolve);
        wasDisconnected = true;
        display("${graphics.DialogReconnecting}", false);
        await new Promise(r => setTimeout(r, 500));
    }
});
</script>
`;

export default function DevServer(options: Omit<BuildOptions, "incremental" | "banner" | "write" | "watch">,
                                  root: string,
                                  injectPaths: string[]) {
    const onBuilt = (error: BuildFailure | null, result: BuildResult | null) => {
        if (error) {
            console.log("Failed to compile file(s)!");
            clients.forEach((res) => res.write(`data: failed\n\n`));
            return;
        }

        const outputs = result!.outputFiles!;

        for (let file of outputs) {
            let p = file.path;
            if (p.startsWith(path.resolve("."))) //TODO Tmp fix for windows
                p = p.replace(path.resolve("."), "").split(path.sep).join(path.posix.sep);
            console.log(`Compiled and injected ${p}`);
            files[p] = file.contents;
        }
        clients.forEach((res) => res.write(`data: ok\n\n`));
        clients.length = 0;
    };

    (async () => {
        let result: BuildResult | null = null;
        let compiling = false;
        try {
            result = await build({
                ...options,
                incremental: true,
                write: false,
            });
            onBuilt(null, result!);
        } catch (ex) {
            onBuilt(ex as BuildFailure, null);
        }
        chokidar.watch(root).on("all", async (eventName, path) => {
            if (compiling)
                return;
            compiling = true;
            try {
                result = await result!.rebuild!();
                onBuilt(null, result!);
            } catch (ex) {
                onBuilt(ex as BuildFailure, null);
            }
            compiling = false;
        });
    })();

    return async function (req: express.Request, res: express.Response, next: express.NextFunction) {
        if (req.path.endsWith("/needreload")) {
            res.set({
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            res.flushHeaders();
            clients.push(res);
            res.write(`data: connected\n\n`);
            res.on("close", () => {
                const index = clients.indexOf(res);
                if (index > -1)
                    clients.splice(index, 1);
                res.end();
            });
            return;
        }

        for (const injectPath of injectPaths) {
            if (req.path === injectPath) {
                const resolvedPath = path.join(root, req.path.endsWith("/") ? req.path + "/index.html" : req.path);
                const fileContent = await fs.promises.readFile(resolvedPath);
                const injected = injection + fileContent;
                res.send(injected);
                return;
            }
        }

        const key = Object.keys(files).find(p => req.path === p);
        if (key != null) {
            res.contentType(path.basename(key));
            res.end(files[key]);
            return;
        }

        next();
    };
};
