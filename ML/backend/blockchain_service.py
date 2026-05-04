import hashlib
import time

class BlockchainLedger:
    def __init__(self):
        self.chain = []
        self.block_height = 0
        self.genesis_block()

    def genesis_block(self):
        self.add_transaction("GENESIS", "System Initialization", "0x00000000000000000000")

    def add_transaction(self, truck_id, event, tx_hash=None):
        self.block_height += 1
        
        if not tx_hash:
            raw_hash = f"{truck_id}{event}{time.time()}".encode()
            tx_hash = "0x" + hashlib.sha256(raw_hash).hexdigest()[:40]
            
        block = {
            "block_height": self.block_height,
            "timestamp": time.time(),
            "truck_id": truck_id,
            "event": event,
            "tx_hash": tx_hash,
            "molecular_bonds": 2 # Aesthetic visualization parameter
        }
        
        self.chain.append(block)
        
        # Keep chain size manageable for UI
        if len(self.chain) > 50:
            self.chain.pop(0)
            
        return block

ledger = BlockchainLedger()
