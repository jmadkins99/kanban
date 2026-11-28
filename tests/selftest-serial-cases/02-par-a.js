// Made-up parallel case for check-runner.sh: logs when it starts and ends.
const fs = require('fs');
const log = (what) => fs.appendFileSync(process.env.SERIAL_LOG, what + ' 02-par-a\n');
log('start');
setTimeout(() => { log('end'); }, 800);
