"use client";

import { Product } from "@/types/pos.types";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils";
import { X, Clock, Flame, Info, Leaf, WheatOff } from "lucide-react";
import { useEffect, useState } from "react";

interface ProductDetailsModalProps {
    product: Product | null;
    isOpen: boolean;
    onClose: () => void;
    onAdd: (product: Product, quantity: number) => void;
}

export const ProductDetailsModal = ({ product, isOpen, onClose, onAdd }: ProductDetailsModalProps) => {
    const [quantity, setQuantity] = useState(1);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            setQuantity(1);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;
    if (!product) return null;

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className={`relative w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform ${isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"}`}>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white z-10 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="grid md:grid-cols-2 gap-0">
                    {/* Image Side */}
                    <div className="relative h-64 md:h-auto bg-neutral-800">
                        {product.imageUrl ? (
                            <Image
                                src={product.imageUrl}
                                alt={product.name}
                                fill
                                priority
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="object-cover"
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-neutral-500">
                                No Image
                            </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-neutral-900 to-transparent h-20" />
                    </div>

                    {/* Content Side */}
                    <div className="p-6 md:p-8 flex flex-col h-full max-h-[80vh] overflow-y-auto">
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-2">
                                {product.isVegetarian && (
                                    <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs font-medium flex items-center gap-1">
                                        <Leaf size={12} /> Veg
                                    </span>
                                )}
                                {product.isGlutenFree && (
                                    <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-xs font-medium flex items-center gap-1">
                                        <WheatOff size={12} /> GF
                                    </span>
                                )}
                                <span className="px-2 py-1 rounded bg-neutral-800 text-neutral-400 text-xs font-medium">
                                    {typeof product.category === 'string'
                                        ? product.category
                                        : product.category?.name || product.category?.label || 'Uncategorized'}
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">{product.name}</h2>
                            <p className="text-emerald-400 text-xl font-bold">{formatCurrency(product.price)}</p>
                        </div>

                        <div className="space-y-6 flex-1">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-300 mb-2 flex items-center gap-2">
                                    <Info size={16} /> Description
                                </h3>
                                <p className="text-neutral-400 text-sm leading-relaxed">
                                    {product.description}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-neutral-800/50 rounded-lg p-3">
                                    <span className="text-xs text-neutral-500 flex items-center gap-1 mb-1">
                                        <Clock size={12} /> Prep Time
                                    </span>
                                    <span className="text-sm text-neutral-200 font-medium">
                                        {product.preparationTime} mins
                                    </span>
                                </div>
                                <div className="bg-neutral-800/50 rounded-lg p-3">
                                    <span className="text-xs text-neutral-500 flex items-center gap-1 mb-1">
                                        <Flame size={12} /> Calories
                                    </span>
                                    <span className="text-sm text-neutral-200 font-medium">
                                        {product.calories || 'N/A'} kcal
                                    </span>
                                </div>
                            </div>

                            {(product.ingredients && product.ingredients.length > 0) && (
                                <div>
                                    <h3 className="text-sm font-semibold text-neutral-300 mb-2">Ingredients</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {product.ingredients.map((ing, i) => (
                                            <span key={i} className="text-xs px-2 py-1 rounded-md bg-neutral-800 text-neutral-400 border border-white/5">
                                                {ing}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(product.allergens && product.allergens.length > 0) && (
                                <div>
                                    <h3 className="text-sm font-semibold text-rose-300 mb-2">Allergens</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {product.allergens.map((alg, i) => (
                                            <span key={i} className="text-xs px-2 py-1 rounded-md bg-rose-950/30 text-rose-400 border border-rose-900/20">
                                                {alg}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Controls */}
                        <div className="mt-8 pt-6 border-t border-white/10">
                            {product.stock !== undefined && (
                                <p className="text-xs text-neutral-500 mb-3">
                                    {product.stock === 0
                                        ? <span className="text-red-400">Out of stock</span>
                                        : <span>{product.stock} available</span>
                                    }
                                </p>
                            )}
                            <div className="flex items-center gap-4">
                                <div className="flex items-center bg-neutral-800 rounded-lg p-1 border border-white/5">
                                    <button
                                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                        className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition"
                                    >
                                        -
                                    </button>
                                    <span className="w-12 text-center font-bold text-white">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(Math.min(product.stock ?? Infinity, quantity + 1))}
                                        disabled={product.stock !== undefined && quantity >= product.stock}
                                        className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        +
                                    </button>
                                </div>
                                <button
                                    onClick={() => {
                                        onAdd(product, quantity);
                                        onClose();
                                    }}
                                    disabled={product.stock !== undefined && product.stock === 0}
                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed text-black font-bold h-12 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    Add to Order • {formatCurrency(product.price * quantity)}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
