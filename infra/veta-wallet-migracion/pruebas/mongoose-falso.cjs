// Mongoose de mentira: una coleccion en memoria que imita find/findOne/updateOne
// lo justo para ejercitar el script de migracion sin tocar ninguna base real.
const store = { docs: [], fallarRelectura: new Set() };
const col = {
  find() {
    const copia = store.docs.map((d) => ({ ...d }));
    return { [Symbol.asyncIterator]: async function* () { for (const d of copia) yield d; } };
  },
  async findOne(q) {
    const d = store.docs.find((x) => x._id === q._id);
    if (!d) return null;
    const c = { ...d };
    // Simula que la base devolvio algo distinto de lo que se escribio.
    if (store.fallarRelectura.has(d._id)) c.privateKey = "U2FsdGVkX1+corrupto";
    return c;
  },
  async updateOne(q, upd) {
    Object.assign(store.docs.find((x) => x._id === q._id), upd.$set);
    return { modifiedCount: 1 };
  },
};
module.exports = {
  __store: store,
  connect: async () => {},
  disconnect: async () => {},
  connection: { db: { collection: () => col } },
};
