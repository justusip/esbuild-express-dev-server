"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const esbuild_1 = require("esbuild");
const chokidar_1 = __importDefault(require("chokidar"));
const graphics_1 = __importDefault(require("./graphics"));
const clients = [];
const files = {};
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
        display("${graphics_1.default.DialogReloading}", false);
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
                    display("${graphics_1.default.DialogFailed}", true);
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
        display("${graphics_1.default.DialogReconnecting}", false);
        await new Promise(r => setTimeout(r, 500));
    }
});
</script>
`;
function DevServer(options, root, injectPaths) {
    const onBuilt = (error, result) => {
        if (error) {
            console.log("Failed to compile file(s)!");
            clients.forEach((res) => res.write(`data: failed\n\n`));
            return;
        }
        const outputs = result.outputFiles;
        for (let file of outputs) {
            let p = file.path;
            if (p.startsWith(path_1.default.resolve("."))) //TODO Tmp fix for windows
                p = p.replace(path_1.default.resolve("."), "").split(path_1.default.sep).join(path_1.default.posix.sep);
            console.log(`Compiled and injected ${p}`);
            files[p] = file.contents;
        }
        clients.forEach((res) => res.write(`data: ok\n\n`));
        clients.length = 0;
    };
    (() => __awaiter(this, void 0, void 0, function* () {
        let result = null;
        let compiling = false;
        try {
            result = yield (0, esbuild_1.build)(Object.assign(Object.assign({}, options), { incremental: true, write: false }));
            onBuilt(null, result);
        }
        catch (ex) {
            onBuilt(ex, null);
        }
        chokidar_1.default.watch(root).on("all", (eventName, path) => __awaiter(this, void 0, void 0, function* () {
            if (compiling)
                return;
            compiling = true;
            try {
                result = yield result.rebuild();
                onBuilt(null, result);
            }
            catch (ex) {
                onBuilt(ex, null);
            }
            compiling = false;
        }));
    }))();
    return function (req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    const resolvedPath = path_1.default.join(root, req.path.endsWith("/") ? req.path + "/index.html" : req.path);
                    const fileContent = yield fs_1.default.promises.readFile(resolvedPath);
                    const injected = injection + fileContent;
                    res.send(injected);
                    return;
                }
            }
            const key = Object.keys(files).find(p => req.path === p);
            if (key != null) {
                res.contentType(path_1.default.basename(key));
                res.end(files[key]);
                return;
            }
            next();
        });
    };
}
exports.default = DevServer;
;
//# sourceMappingURL=index.js.map