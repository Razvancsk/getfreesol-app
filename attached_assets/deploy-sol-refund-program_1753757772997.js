const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@project-serum/anchor');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function deploySolRefundProgram() {
    console.log('SOL REFUND PROGRAM: Starting deployment...');

    const programDir = path.join(__dirname, 'programs', 'sol-refund');
    const programKeypairPath = path.join(programDir, 'keypair.json');
    const binaryPath = path.join(programDir, 'target', 'deploy', 'sol_refund.so');

    // Load or create program keypair
    let programKeypair;
    if (fs.existsSync(programKeypairPath)) {
        const keypairData = JSON.parse(fs.readFileSync(programKeypairPath, 'utf8'));
        programKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        console.log('Using existing program keypair:', programKeypair.publicKey.toString());
    } else {
        programKeypair = Keypair.generate();
        fs.writeFileSync(programKeypairPath, JSON.stringify(Array.from(programKeypair.secretKey)));
        console.log('Generated new program keypair:', programKeypair.publicKey.toString());
    }

    // Check compiled binary
    if (!fs.existsSync(binaryPath)) {
        console.error('ERROR: Compiled .so file not found. Run "anchor build" first.');
        return;
    }

    // Load payer keypair
    const payerKeypairPath = path.join(__dirname, 'payer-keypair.json');
    if (!fs.existsSync(payerKeypairPath)) {
        console.error('ERROR: Missing payer-keypair.json. Please create it with your funded wallet.');
        return;
    }

    const payerKeypairData = JSON.parse(fs.readFileSync(payerKeypairPath, 'utf8'));
    const payerKeypair = Keypair.fromSecretKey(new Uint8Array(payerKeypairData));
    const wallet = new Wallet(payerKeypair);

    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const provider = new AnchorProvider(connection, wallet, {});

    console.log('Deployer wallet:', payerKeypair.publicKey.toString());
    console.log('Program ID (to be deployed):', programKeypair.publicKey.toString());

    // Deploy the binary using Solana CLI
    try {
        console.log('Deploying program via solana CLI...');
        const deployCommand = `solana program deploy ${binaryPath} --program-id ${programKeypairPath}`;
        const output = execSync(deployCommand, { encoding: 'utf-8' });
        console.log('SOLANA CLI OUTPUT:\n', output);
    } catch (err) {
        console.error('Deployment failed via solana CLI:', err.message);
        return;
    }

    // Load IDL
    const idlPath = path.join(programDir, 'idl.json');
    if (!fs.existsSync(idlPath)) {
        console.error('ERROR: IDL not found. Build the program with "anchor build" first.');
        return;
    }
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

    // Instantiate the program
    try {
        const program = new Program(idl, programKeypair.publicKey, provider);

        console.log('✅ Deployment successful!');
        console.log('Program ID:', program.programId.toString());
        console.log('Fee collector wallet: 9QQk8474MNkfmNtdt6cvZbCPwiJicJ125N2NLqfyumYC');

        // Save config
        const configPath = path.join(__dirname, 'sol-refund-config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            programId: program.programId.toString(),
            feeCollector: '9QQk8474MNkfmNtdt6cvZbCPwiJicJ125N2NLqfyumYC',
            feePercentage: 15
        }, null, 2));

        return program.programId.toString();
    } catch (error) {
        console.error('Failed to instantiate Anchor program:', error);
        throw error;
    }
}

if (require.main === module) {
    deploySolRefundProgram()
        .then(programId => {
            console.log('✅ SOL REFUND PROGRAM READY with Program ID:', programId);
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { deploySolRefundProgram };