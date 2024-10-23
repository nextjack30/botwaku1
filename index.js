const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');

// Impor Premium Manager
const premiumManager = require('./premiumManager');

const API_URL = 'https://algaza.my.id/wdcp/barcodes.php';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const messageQueue = new Map();
const RATE_LIMIT_DELAY = 500;
const ADMIN_NUMBER = '6285290857373@s.whatsapp.net';

function isAdmin(userId) { return userId === ADMIN_NUMBER; }
function isPremiumUser(userId) { return premiumManager.isPremium(userId); }

async function generateBarcode(text) {
    try {
        return await bwipjs.toBuffer({
            bcid: 'code128', text, scale: 3, height: 10,
            includetext: true, textxalign: 'center',
            backgroundcolor: 'FFFFFF', padding: 10
        });
    } catch (error) {
        console.error('Error generating barcode:', error);
        throw new Error('Gagal membuat barcode');
    }
}

async function searchPLU(query) {
    try {
        const response = await axios.get(API_URL, {
            params: { cari: query }, timeout: 10000
        });
        if (response.data.status === "success") return response.data.data;
        throw new Error(response.data.message || 'Data tidak ditemukan');
    } catch (error) {
        console.error('Search error:', error.message);
        throw new Error('Gagal mencari data PLU/Barcode');
    }
}

async function sendMessageWithRetry(sock, jid, content, quoted = undefined, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await delay(RATE_LIMIT_DELAY);
            return await sock.sendMessage(jid, content, { quoted });
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await delay(500 * (i + 1));
        }
    }
}

async function sendMainMenu(sock, userId, quoted) {
    const menuText = `*🤖 BOT PLU/BARCODE CHECKER*\n\n` +
        `Pilih menu dengan mengetik nomornya:\n\n` +
        `0️⃣ Menu Utama\n` +
        `1️⃣ Pencarian Barcode\n` +
        `2️⃣ Premium\n` +
        `3️⃣ Cara Penggunaan\n` +
        (isAdmin(userId) ? `4️⃣ Menu Admin\n` : '') +
        `\nSilakan pilih menu yang tersedia!`;

    await sendMessageWithRetry(sock, userId, { text: menuText }, quoted);
}

async function handlePremiumMenu(sock, userId, quoted) {
    const premiumText = `*💫 PREMIUM FEATURES*\n\n` +
        `CARA Premium:\n` +
        `• BAYAR 40K/BLN \n` +
        `• HANYA BISA 1 ORANG/BAYAR \n` +
        `• HUBUNGI  wa.me/6283875128654\n\n` +
        `Hubungi admin untuk upgrade ke Premium!`;

    await sendMessageWithRetry(sock, userId, { text: premiumText }, quoted);
}

async function handleUsageInstructions(sock, userId, quoted) {
    const usageText = `*📖 CARA PENGGUNAAN*\n\n` +
        `1. Pencarian Barcode:\n` +
        `   • Ketik PLU atau paste dari komputer atau dokumen \n` +
        `   • Untuk multi-pencarian, ketik beberapa PLU\n` +
        `     (satu baris per kode)\n\n` +
        `Contoh Multi-pencarian:\n` +
        `12345787\n` +
        `89970259\n` +
        `89970259\n\n` +
        `2. Menu Premium:\n` +
        `   Ketik '2' untuk info premium\n\n` +
        `3. Kembali ke Menu:\n` +
        `   Ketik '0' kapan saja`;

    await sendMessageWithRetry(sock, userId, { text: usageText }, quoted);
}

async function handleAdminMenu(sock, userId, quoted) {
    if (!isAdmin(userId)) {
        await sendMessageWithRetry(sock, userId, { 
            text: '❌ Anda tidak memiliki akses ke menu ini' 
        }, quoted);
        return;
    }

    const adminText = `*👨 ADMIN MENU*\n\n` +
        `Perintah Admin:\n` +
        `67. Tambah User Premium\n` +
        `68. Hapus User Premium\n` +
        `69. List User Premium\n` +
        `70. Broadcast Pesan\n\n` +
        `Format nomor: 628xxxxxxxxxx`;

    await sendMessageWithRetry(sock, userId, { text: adminText }, quoted);
}

async function handleAdminSubmenu(sock, userId, messageText, quoted) {
    switch(messageText.trim()) {
        case '67':
            await sendMessageWithRetry(sock, userId, {
                text: 'Masukkan nomor yang akan ditambahkan ke premium\nFormat: 628xxxxxxxxxx'
            }, quoted);
            return true;
        case '68':
            await sendMessageWithRetry(sock, userId, {
                text: 'Masukkan nomor yang akan dihapus dari premium\nFormat: 628xxxxxxxxxx'
            }, quoted);
            return true;
        case '69':
            const premiumList = premiumManager.getAllUsers()
                .map(num => num.replace('@s.whatsapp.net', ''))
                .join('\n');
            await sendMessageWithRetry(sock, userId, {
                text: `*DAFTAR USER PREMIUM*\n\n${premiumList || 'Tidak ada user premium'}`
            }, quoted);
            return true;
        case '70':
            await sendMessageWithRetry(sock, userId, {
                text: 'Masukkan pesan yang akan di-broadcast'
            }, quoted);
            return true;
        default:
            return false;
    }
}

async function handleBarcodeSearch(sock, userId, messageText, quoted) {
    if (!isPremiumUser(userId) && !isAdmin(userId)) {
        await sendMessageWithRetry(sock, userId, {
            text: '❌ Fitur ini hanya tersedia untuk user Premium\n\nKetik "2" untuk info Premium'
        }, quoted);
        return;
    }

    const queries = messageText.split('\n')
        .map(q => q.trim())
        .filter(q => q.length >= 4 && /^\d+$/.test(q));

    if (queries.length === 0) {
        await sendMessageWithRetry(sock, userId, {
            text: '❌ PLU/Barcode tidak valid'
        }, quoted);
        return;
    }

    if (queries.length > 3) {
        await sendMessageWithRetry(sock, userId, {
            text: `🔍 Memproses ${queries.length} PLU...`
        }, quoted);
    }

    let successCount = 0;
    let failCount = 0;

    for (const [index, query] of queries.entries()) {
        try {
            const results = await searchPLU(query);

            for (const item of results) {
                const barcodeBuffer = await generateBarcode(item.barcode);

                await sendMessageWithRetry(sock, userId, {
                    image: barcodeBuffer,
                    caption: `*Informasi Produk*\n\n` +
                            `PLU: ${item.plu}\n` +
                            `Barcode: ${item.barcode}`
                }, quoted);
            }

            successCount++;
        } catch (error) {
            console.error(`Error processing PLU ${query}:`, error);
            await sendMessageWithRetry(sock, userId, {
                text: `❌ Gagal: ${query}`
            }, quoted);
            failCount++;
        }

        if (index < queries.length - 1) {
            await delay(500);
        }
    }

    if (queries.length > 3) {
        await sendMessageWithRetry(sock, userId, {
            text: `📊 Hasil:\n✅ ${successCount} berhasil\n❌ ${failCount} gagal`
        }, quoted);
    }
}

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 1000
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if(connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Koneksi terputus karena ', lastDisconnect?.error?.message, ', reconnect ', shouldReconnect);

                if(shouldReconnect) {
                    await delay(5000);
                    connectToWhatsApp();
                }
            } else if(connection === 'open') {
                console.log('Bot WhatsApp telah terhubung!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const m = messages[0];
                if (!m.message || m.key.fromMe) return;

                const messageType = Object.keys(m.message)[0];
                const messageContent = m.message[messageType];
                const messageText = messageType === 'conversation' ? messageContent :
                                  messageType === 'extendedTextMessage' ? messageContent.text : '';

                if (!messageText) return;

                const userId = m.key.remoteJid;

                if (messageQueue.has(userId)) {
                    const lastTime = messageQueue.get(userId);
                    const timeDiff = Date.now() - lastTime;
                    if (timeDiff < RATE_LIMIT_DELAY) {
                        await sendMessageWithRetry(sock, userId, {
                            text: '⚠️ Mohon tunggu sebentar'
                        }, m);
                        return;
                    }
                }
                messageQueue.set(userId, Date.now());

                const adminState = messageQueue.get(`${userId}_admin_state`) || '';

                switch(messageText.trim()) {
                    case '0':
                        messageQueue.delete(`${userId}_admin_state`);
                        await sendMainMenu(sock, userId, m);
                        return;
                    case '1':
                        messageQueue.delete(`${userId}_admin_state`);
                        if (!isPremiumUser(userId) && !isAdmin(userId)) {
                            await sendMessageWithRetry(sock, userId, {
                                text: '*🔒 AKSES TERBATAS*\n\n' +
                                     'Fitur ini hanya tersedia untuk user Premium\n\n' +
                                     'Ketik "2" untuk informasi Premium'
                            }, m);
                        } else {
                            await sendMessageWithRetry(sock, userId, {
                                text: `*🔍 PENCARIAN BARCODE*\n\n` +
                                     `Silakan kirim PLU atau Barcode yang ingin dicari.\n\n` +
                                     `Untuk multi-pencarian, kirim beberapa kode\n` +
                                     `(satu baris per kode)\n\n` +
                                     `Contoh:\n` +
                                     `8997025911111\n` +
                                     `8997025922222`
                            }, m);
                        }
                        return;
                    case '2':
                        messageQueue.delete(`${userId}_admin_state`);
                        await handlePremiumMenu(sock, userId, m);
                        return;
                    case '3':
                        messageQueue.delete(`${userId}_admin_state`);
                        await handleUsageInstructions(sock, userId, m);
                        return;
                    case '4':
                        if (isAdmin(userId)) {
                            messageQueue.delete(`${userId}_admin_state`);
                            await handleAdminMenu(sock, userId, m);
                        }
                        return;
                }

                if (isAdmin(userId)) {
                    const isAdminCommand = await handleAdminSubmenu(sock, userId, messageText, m);
                    if (isAdminCommand) {
                        messageQueue.set(`${userId}_admin_state`, messageText.trim());
                        return;
                    }

                    switch(adminState) {
                        case '67': // Add premium user
                            if (/^628\d+$/.test(messageText.trim())) {
                                const userNumber = `${messageText.trim()}@s.whatsapp.net`;
                                premiumManager.addUser(userNumber);
                                await sendMessageWithRetry(sock, userId, {
                                    text: `✅ User ${messageText.trim()} berhasil ditambahkan ke premium`
                                }, m);
                                messageQueue.delete(`${userId}_admin_state`);
                            } else {
                                await sendMessageWithRetry(sock, userId, {
                                    text: '❌ Format nomor tidak valid\nGunakan format: 628xxxxxxxxxx'
                                }, m);
                            }
                            return;
                        case '68': // Remove premium user
                            if (/^628\d+$/.test(messageText.trim())) {
                                const userNumber = `${messageText.trim()}@s.whatsapp.net`;
                                if (premiumManager.removeUser(userNumber)) {
                                    await sendMessageWithRetry(sock, userId, {
                                        text: `✅ User ${messageText.trim()} berhasil dihapus dari premium`
                                    }, m);
                                } else {
                                    await sendMessageWithRetry(sock, userId, {
                                        text: `❌ User ${messageText.trim()} tidak ditemukan dalam daftar premium`
                                    }, m);
                                }
                                messageQueue.delete(`${userId}_admin_state`);
                            } else {
                                await sendMessageWithRetry(sock, userId, {
                                    text: '❌ Format nomor tidak valid\nGunakan format: 628xxxxxxxxxx'
                                }, m);
                            }
                            return;
                        case '70': // Broadcast
                                const premiumList = premiumManager.getAllUsers();
                                let successCount = 0;
                                let failCount = 0;

                                await sendMessageWithRetry(sock, userId, {
                                    text: '📢 Memulai broadcast...'
                                }, m);

                                for (const targetUser of premiumList) {
                                    try {
                                        await sendMessageWithRetry(sock, targetUser, {
                                            text: messageText
                                        });
                                        successCount++;
                                        await delay(1000);
                                    } catch (error) {
                                        console.error(`Failed to broadcast to ${targetUser}:`, error);
                                        failCount++;
                                    }
                                }

                                await sendMessageWithRetry(sock, userId, {
                                    text: `✅ Broadcast selesai\n\nBerhasil: ${successCount}\nGagal: ${failCount}`
                                }, m);
                                messageQueue.delete(`${userId}_admin_state`);
                                return;
                    }
                }

                if (/\d/.test(messageText)) {
                    await handleBarcodeSearch(sock, userId, messageText, m);
                }

            } catch (error) {
                console.error('Message handling error:', error);
                if (m && m.key && m.key.remoteJid) {
                    await sendMessageWithRetry(sock, m.key.remoteJid, {
                        text: '❌ Terjadi kesalahan sistem'
                    }, m);
                }
            }
        });

    } catch (error) {
        console.error('Connection error:', error);
        await delay(10000);
        connectToWhatsApp();
    }
}

// Error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

// Jalankan bot
console.log('Starting WhatsApp bot...');
connectToWhatsApp();