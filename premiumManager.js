const fs = require('fs');
const path = require('path');

class PremiumManager {
    constructor() {
        this.premiumUsers = new Set();
        this.filePath = path.join(__dirname, 'data', 'premium_users.json');
        this.init();
    }

    init() {
        try {
            // Buat direktori data jika belum ada
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Baca data dari file jika ada
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                const users = JSON.parse(data);
                this.premiumUsers = new Set(users);
                console.log('Premium users loaded:', this.premiumUsers.size);
            }
        } catch (error) {
            console.error('Error initializing premium users:', error);
        }
    }

    addUser(userId) {
        this.premiumUsers.add(userId);
        this.saveToFile();
        return true;
    }

    removeUser(userId) {
        const result = this.premiumUsers.delete(userId);
        this.saveToFile();
        return result;
    }

    isPremium(userId) {
        return this.premiumUsers.has(userId);
    }

    getAllUsers() {
        return Array.from(this.premiumUsers);
    }

    saveToFile() {
        try {
            const data = JSON.stringify(Array.from(this.premiumUsers));
            fs.writeFileSync(this.filePath, data, 'utf8');

            // Buat backup
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(__dirname, 'data', 'backup');

            // Buat direktori backup jika belum ada
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const backupPath = path.join(backupDir, `premium_users.${timestamp}.json`);
            fs.writeFileSync(backupPath, data, 'utf8');

            // Hapus backup lama (simpan 5 terakhir)
            const backups = fs.readdirSync(backupDir)
                .filter(file => file.startsWith('premium_users.'))
                .sort()
                .reverse();

            backups.slice(5).forEach(backup => {
                fs.unlinkSync(path.join(backupDir, backup));
            });

            console.log('Premium users saved successfully');
        } catch (error) {
            console.error('Error saving premium users:', error);
        }
    }
}

module.exports = new PremiumManager();