// start.js
import "dotenv/config";
import { execSync, fork, ChildProcess } from "child_process";

const cmd = {
    git_log: 'git log -1 "--pretty=format:%h %s -- %cd"',
    git_fetch: "git fetch origin",
    git_reset: "git reset --hard origin/main",
}

const CHECK_INTERVAL = 10 * 60 * 1000;

/** @type {ChildProcess} */
let appProcess = null;
let currentVersion = null;

function mylog(...args) {
    console.log(new Date(), ...args);
}

function runCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch (error) {
        console.error(`run \`${command}\`:\n`, error);
        return '';
    }
}

// 启动主应用
function startApp() {
    if (appProcess) {
        mylog('killing ' + appProcess.pid);
        try {
            appProcess.kill('SIGKILL');
        } catch (err) { }
    }

    appProcess = fork('./app.js')

    appProcess.on('exit', code => {
        mylog(`${appProcess.pid} exited with code ${code}`);
    });
}

async function startAppWrapped() {
    try {
        let ver = runCommand(cmd.git_log);

        if (ver === currentVersion) {
            mylog('no update needed.', currentVersion);
            return;
        }

        currentVersion = ver;
        mylog('loading app version', currentVersion);
        startApp();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

function startWatcher() {
    startAppWrapped();
    if (process.env.AUTO_UPDATE === 'true') {
        setInterval(() => {
            runCommand(cmd.git_fetch);
            runCommand(cmd.git_reset);
            startAppWrapped();
        }, CHECK_INTERVAL);
    }

}
// 启动监控
startWatcher();

// 处理退出信号
process.on('SIGINT', () => {
    mylog('stop app ...');
    try {
        appProcess.kill('SIGKILL');
    } catch (err) { }
    mylog('app stopped.');
    process.exit();
});