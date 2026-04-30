import { useState } from "react";
import fdaCodes from "@/lib/fda-product-codes.json";
import { Search } from "lucide-react";

interface ProductCode {
    code: string;
    deviceClass: string;
    description: string;
    regulationNumber: string;
    requiresSoftware: boolean;
    requiresClinical: boolean;
    requiresBiocompatibility: boolean;
}

interface ProductCodeSelectorProps {
    onSelect: (code: ProductCode | null) => void;
}

export function ProductCodeSelector({ onSelect }: ProductCodeSelectorProps) {
    const [search, setSearch] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [selected, setSelected] = useState<ProductCode | null>(null);

    const filteredCodes = fdaCodes.filter(
        c => 
            c.description.toLowerCase().includes(search.toLowerCase()) || 
            c.code.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (code: ProductCode) => {
        setSelected(code);
        setSearch("");
        setIsOpen(false);
        onSelect(code);
    };

    return (
        <div className="relative mb-6">
            <h2 className="text-lg font-bold mb-2">1. Select Medical Device Type</h2>
            <p className="text-sm text-[var(--muted)] mb-3">
                TraceBridge uses the FDA Product Code to automatically optimize your gap analysis algorithm.
            </p>
            
            {/* The Selected View */}
            {selected ? (
                <div className="p-4 border border-[var(--success)] bg-[var(--success)]/5 rounded-xl flex justify-between items-center">
                    <div>
                        <div className="font-bold flex items-center gap-2">
                            <span className="bg-[var(--success)] text-black px-2 py-0.5 rounded-md text-xs">{selected.code}</span>
                            {selected.description}
                        </div>
                        <div className="text-xs text-[var(--muted)] mt-1">
                            {selected.deviceClass} • {selected.regulationNumber}
                        </div>
                    </div>
                    <button 
                        onClick={() => { setSelected(null); onSelect(null); }}
                        className="text-xs text-[var(--danger)] hover:underline"
                    >
                        Change
                    </button>
                </div>
            ) : (
                /* The Search View */
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all placeholder:text-slate-400 shadow-sm"
                        placeholder="Search for a medical device (e.g. Glucose Monitor, Scalpel)..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                    />
                    
                    {/* The Dropdown Menu */}
                    {isOpen && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                            {filteredCodes.length === 0 ? (
                                <div className="p-3 text-slate-500 text-sm">No exact matches found. Try simplifying your search.</div>
                            ) : (
                                filteredCodes.map((code) => (
                                    <div 
                                        key={code.code}
                                        onClick={() => handleSelect(code)}
                                        className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors"
                                    >
                                        <div className="font-semibold text-slate-900">{code.description} <span className="text-[var(--primary)] text-xs ml-1 bg-blue-50 px-1 py-0.5 rounded border border-blue-100">[{code.code}]</span></div>
                                        <div className="text-xs text-slate-500 font-medium mt-1">{code.deviceClass}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
