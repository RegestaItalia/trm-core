// Answers known prompts by name until an unknown prompt, a validation error, or the end of the run.
// Usage: node e2e/harness/auto.js '<json map>' | node e2e/harness/auto.js @<answers file .json>
//   map: { "<prompt name>": <value> | {"$default": true} | [<values in order of appearance>] }
// Prints each answered prompt, then "@@NEEDS ANSWER" + the question, "@@DONE" or "@@STILL RUNNING".
const fs = require('fs');
const path = require('path');
const { IPC } = require('./paths');

const arg = process.argv[2] || '{}';
const map = JSON.parse(arg.startsWith('@') ? fs.readFileSync(arg.slice(1), 'utf8') : arg);
const used = {};
const deadline = Date.now() + 9.5 * 60 * 1000;

function pending() {
    return fs.readdirSync(IPC)
        .filter(f => /^q-\d+\.json$/.test(f) && !fs.existsSync(path.join(IPC, f.replace('q-', 'a-'))))
        .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
}

function loop() {
    const questions = pending();
    if (questions.length) {
        const q = JSON.parse(fs.readFileSync(path.join(IPC, questions[0]), 'utf8'));
        let entry = map[q.name];
        if (Array.isArray(entry)) {
            const i = used[q.name] || 0;
            entry = entry[i];
            used[q.name] = i + 1;
        }
        if (entry === undefined || q.error) {
            console.log('@@NEEDS ANSWER\n' + JSON.stringify(q, null, 2));
            return;
        }
        const answer = entry && entry.$default ? { useDefault: true } : { value: entry };
        console.log(`[Q${q.id}] ${q.message}  =>  ${JSON.stringify(answer)}`);
        fs.writeFileSync(path.join(IPC, `a-${q.id}.json`), JSON.stringify(answer));
        return setTimeout(loop, 700);
    }
    if (fs.existsSync(path.join(IPC, 'done'))) return console.log('@@DONE');
    if (Date.now() > deadline) return console.log('@@STILL RUNNING');
    setTimeout(loop, 700);
}
loop();
