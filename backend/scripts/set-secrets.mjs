import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
// Pipe one JSON line. No secrets in command arguments or output; no PTY echo.
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Waiting for secure credential input.');
const input=createInterface({input:process.stdin,terminal:false});
for await(const line of input){
 if(line.length>4096)throw Error('Input too large');
 const value=JSON.parse(line);if(!/^re_[A-Za-z0-9_]+$/.test(value.RESEND_API_KEY))throw Error('Invalid sending key');
 await writeFile(new URL('../.cloud-secrets.json',import.meta.url),JSON.stringify({AUTH_SECRET:randomBytes(48).toString('base64url'),RESEND_API_KEY:value.RESEND_API_KEY}),{mode:0o600,flag:'wx'});
 console.log('Independent backend secrets saved to ignored local file.');if(process.stdin.isTTY&&!process.stdin.destroyed)process.stdin.setRawMode(false);input.close();process.stdin.pause();break;
}
