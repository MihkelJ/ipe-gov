/**
 * Shared configuration for the offchain subname pilot. Subnames live under
 * the `ENS_PARENT_NAME` parent and are issued + resolved through NameStone's
 * gasless ENS infrastructure. Switching to a production parent later means
 * swapping this constant and pointing the new parent's mainnet ENS resolver
 * at NameStone (one-time owner action).
 */
export const ENS_PARENT_NAME = "govdemo.eth";
