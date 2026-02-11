// ===== DB MODULE =====
// Wrapper IndexedDB puro para Chamada Fácil
// Sem dependências externas

const DB_NAME = "chamada_facil_db";
const DB_VERSION = 3;

const db = {
    // Conexão singleton
    conn: null,

    // Inicializar Banco de Dados
    init() {
        return new Promise((resolve, reject) => {
            if (this.conn) {
                console.log("[db] conexao reutilizada");
                return resolve();
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("[db] erro ao abrir:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.conn = event.target.result;

                this.conn.onversionchange = () => {
                    console.warn("[db] version change — fechando conexão");
                    this.conn.close();
                    this.conn = null;
                };

                console.log("[db] aberto com sucesso");
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const tx = event.target.transaction; // Necessário para store existente
                console.log("[db] upgrade needed v" + DB_VERSION);

                // Helper para garantir indexes
                const ensureIndex = (storeName, indexName, keyPath, options) => {
                    try {
                        const store = tx.objectStore(storeName);
                        if (!store.indexNames.contains(indexName)) {
                            console.log(`[db] criando index ${storeName}.${indexName}`);
                            store.createIndex(indexName, keyPath, options);
                        }
                    } catch (e) {
                        console.error(`[db] erro ensureIndex ${storeName}.${indexName}`, e);
                        throw e; // Production safety: não mascarar erros de DB
                    }
                };

                // Config Store
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }

                // Escolas Store
                if (!db.objectStoreNames.contains('escolas')) {
                    db.createObjectStore('escolas', { keyPath: 'id' });
                }

                // Turmas Store
                if (!db.objectStoreNames.contains('turmas')) {
                    const store = db.createObjectStore('turmas', { keyPath: 'id' });
                    store.createIndex('escolaId', 'escolaId', { unique: false });
                } else {
                    ensureIndex('turmas', 'escolaId', 'escolaId', { unique: false });
                }

                // Alunos Store
                if (!db.objectStoreNames.contains('alunos')) {
                    const store = db.createObjectStore('alunos', { keyPath: 'id' });
                    store.createIndex('turmaId', 'turmaId', { unique: false });
                    store.createIndex('matricula', 'matricula', { unique: false });
                    store.createIndex('qrId', 'qrId', { unique: true });
                } else {
                    ensureIndex('alunos', 'turmaId', 'turmaId', { unique: false });
                    ensureIndex('alunos', 'matricula', 'matricula', { unique: false });
                    ensureIndex('alunos', 'qrId', 'qrId', { unique: true });
                }

                // Chamadas Store
                if (!db.objectStoreNames.contains('chamadas')) {
                    const store = db.createObjectStore('chamadas', { keyPath: 'id' });
                    store.createIndex('turmaId', 'turmaId', { unique: false });
                    store.createIndex('data', 'data', { unique: false });
                } else {
                    ensureIndex('chamadas', 'turmaId', 'turmaId', { unique: false });
                    ensureIndex('chamadas', 'data', 'data', { unique: false });
                }

                // Eventos Notas Store
                if (!db.objectStoreNames.contains('eventos_nota')) {
                    const store = db.createObjectStore('eventos_nota', { keyPath: 'id' });
                    store.createIndex('alunoId', 'alunoId', { unique: false });
                } else {
                    ensureIndex('eventos_nota', 'alunoId', 'alunoId', { unique: false });
                }
            };
        });
    },

    // Gerar ID único (UUID v4)
    _generateId() {
        return utils.uuid();
    },

    // Transaction Helper
    transaction(storeNames, mode = 'readonly', callback = null) {
        if (!this.conn) return Promise.reject(new Error("Database not initialized"));

        if (callback) {
            return new Promise((resolve, reject) => {
                const tx = this.conn.transaction(storeNames, mode);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
                try {
                    callback(tx);
                } catch (e) {
                    tx.abort();
                    reject(e);
                }
            });
        } else {
            return Promise.resolve(this.conn.transaction(storeNames, mode));
        }
    },

    // Obter um item (Get)
    get(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.conn) return reject(new Error("Database not initialized"));

            const transaction = this.conn.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (event) => {
                console.error(`[db] erro get ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Obter todos (GetAll)
    getAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.conn) return reject(new Error("Database not initialized"));

            const transaction = this.conn.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (event) => {
                console.error(`[db] erro getAll ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Obter por Índice (GetByIndex)
    getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            if (!this.conn) return reject(new Error("Database not initialized"));

            const transaction = this.conn.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);

            let index;
            try {
                index = store.index(indexName);
            } catch (e) {
                console.error(`[db] index inexistente ${storeName}.${indexName}`);
                return reject(e);
            }
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (event) => {
                console.error(`[db] erro getByIndex ${storeName}.${indexName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Adicionar (Add) - Falha se existir
    add(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!this.conn) return reject(new Error("Database not initialized"));

            if (!data.id) {
                data.id = this._generateId();
            }

            const transaction = this.conn.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(data.id);
            request.onerror = (event) => {
                console.error(`[db] erro add ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Atualizar/Inserir (Put) - Upsert
    put(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!this.conn) return reject(new Error("Database not initialized"));

            if (!data.id) {
                data.id = this._generateId();
            }

            const transaction = this.conn.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(data.id);
            request.onerror = (event) => {
                console.error(`[db] erro put ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    },

    // Deletar (Delete)
    delete(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.conn) return reject(new Error("Database not initialized"));

            const transaction = this.conn.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = (event) => {
                console.error(`[db] erro delete ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    }
};
