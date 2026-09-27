/**
 * Parse one ItemMoveInfoV5 row after comments have been removed.
 * Older tables may omit the final guild-storage flag.
 */
export function parseItemMoveInfoColumns(columns) {
  if (!Array.isArray(columns) || columns.length < 8 || columns.length > 9) return null;
  const [key, drop, exchange, storage, cart, npcSale, mail, auction, guildStorage = "0"] = columns;
  return {
    key,
    moveInfo: {
      Drop: drop === "1",
      Exchange: exchange === "1",
      Storage: storage === "1",
      Cart: cart === "1",
      NPCSale: npcSale === "1",
      Mail: mail === "1",
      Auction: auction === "1",
      GuildStorage: guildStorage === "1"
    }
  };
}
