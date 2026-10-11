// Answers one prompt (optional), then waits for the next prompt or the end of the run.
// Usage: node e2e/harness/wait.js [<prompt id> '<answer json>']
//   answer json: {"value": <answer>} or {"useDefault": true}
// Prints the pending question JSON, "@@DONE (see run output)" or "@@STILL RUNNING" (after ~9.5 minutes).
const fs = require('fs');
const path = require('path');
const { IPC } = require('./paths');

const [, , answerId, answerJson] = process.argv;
if (answerId) fs.writeFileSync(path.join(IPC, `a-${answerId}.json`), answerJson);
const deadline = Date.now() + 9.5 * 60 * 1000;

function pending() {
    return fs.readdirSync(IPC)
        .filter(f => /^q-\d+\.json$/.test(f) && !fs.existsSync(path.join(IPC, f.replace('q-', 'a-'))))
        .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
}

(function loop() {
    const questions = pending();
    if (questions.length) return console.log(fs.readFileSync(path.join(IPC, questions[0]), 'utf8'));
    if (fs.existsSync(path.join(IPC, 'done'))) return console.log('@@DONE (see run output)');
    if (Date.now() > deadline) return console.log('@@STILL RUNNING');
    setTimeout(loop, 700);
})();
