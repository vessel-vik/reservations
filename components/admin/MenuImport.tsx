'use client';

import { useState, useCallback, useRef } from 'react';
import { fetchWithSession } from '@/lib/fetch-with-session';
import { Upload, FileText, AlertTriangle, Check, X, Download, ArrowRight } from 'lucide-react';

interface Category {
  name: string;
  slug?: string;
  description?: string;
}

interface Product {
  name: string;
  price: number;
  category: string;
  description?: string;
  isAvailable?: boolean;
}

interface ImportData {
  categories: Category[];
  products: Product[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: { categories: number; products: number };
}

interface ImportResults {
  categoriesCreated: number;
  productsCreated: number;
  categoriesSkipped: number;
  productsSkipped: number;
  errors: string[];
  warnings: string[];
}

export default function MenuImport() {
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateJson = async (data: ImportData) => {
    setLoading(true);
    try {
      const res = await fetchWithSession('/api/menu/import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      setValidation(result);
      if (result.valid) {
        setStep('preview');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setError('Please upload a JSON file');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text) as ImportData;
      
      if (!data.categories || !data.products) {
        setError('Invalid format: JSON must contain "categories" and "products" arrays');
        setLoading(false);
        return;
      }

      setImportData(data);
      await validateJson(data);
    } catch (err: any) {
      setError('Failed to parse JSON: ' + err.message);
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleImport = async () => {
    if (!importData) return;
    
    setLoading(true);
    setImportResults(null);
    
    try {
      const res = await fetchWithSession('/api/menu/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importData)
      });
      const result = await res.json();
      setImportResults(result.results);
      setStep('results');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImportData(null);
    setValidation(null);
    setImportResults(null);
    setError(null);
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadSampleJson = () => {
    const sample = {
      categories: [
        { name: "Drinks", slug: "drinks", description: "Beverages" },
        { name: "Main Course", slug: "main-course", description: "Main dishes" }
      ],
      products: [
        { name: "Cola", price: 150, category: "Drinks", description: "Soft drink 500ml", isAvailable: true },
        { name: "Grilled Chicken", price: 850, category: "Main Course", description: "Grilled chicken with vegetables", isAvailable: true }
      ]
    };
    
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-import-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Menu Import</h2>
          <p className="text-sm text-gray-400">Bulk import products and categories from JSON file</p>
        </div>
        <button
          onClick={downloadSampleJson}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {['upload', 'preview', 'results'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-amber-500 text-black' :
              ['preview', 'results'].includes(step) && i < ['upload', 'preview', 'results'].indexOf(step) ? 'bg-emerald-500 text-white' :
              'bg-gray-700 text-gray-400'
            }`}>
              {['preview', 'results'].includes(step) && i < ['upload', 'preview', 'results'].indexOf(step) ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < 2 && <div className={`w-12 h-0.5 ${
              ['preview', 'results'].includes(step) ? 'bg-emerald-500' : 'bg-gray-700'
            }`} />}
          </div>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Step */}
      {step === 'upload' && (
        <div 
          className="border-2 border-dashed border-gray-600 rounded-xl p-12 text-center hover:border-amber-500/50 transition-colors cursor-pointer"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Drop JSON file here</h3>
          <p className="text-sm text-gray-400">or click to browse</p>
        </div>
      )}

      {/* Preview Step */}
      {step === 'preview' && importData && validation && (
        <div className="space-y-4">
          {/* Validation Results */}
          {validation.errors.length > 0 && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                <AlertTriangle className="w-4 h-4" />
                Validation Errors
              </div>
              <ul className="text-sm text-red-300 space-y-1">
                {validation.errors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-amber-400 font-medium mb-2">
                <AlertTriangle className="w-4 h-4" />
                Warnings
              </div>
              <ul className="text-sm text-amber-300 space-y-1">
                {validation.warnings.map((warn, i) => (
                  <li key={i}>• {warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Data Preview */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Categories ({importData.categories.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {importData.categories.map((cat, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">{cat.name}</span>
                    {cat.slug && <span className="text-gray-500 text-xs">({cat.slug})</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Products ({importData.products.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {importData.products.map((prod, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{prod.name}</span>
                    <span className="text-amber-400">KSh {prod.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Importing...' : 'Import Menu'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Results Step */}
      {step === 'results' && importResults && (
        <div className="space-y-4">
          <div className={`rounded-lg p-6 ${importResults.errors.length > 0 ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
            <div className="flex items-center gap-3 mb-4">
              {importResults.errors.length > 0 ? (
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              ) : (
                <Check className="w-6 h-6 text-emerald-400" />
              )}
              <h3 className="text-lg font-medium text-white">
                {importResults.errors.length > 0 ? 'Import Completed with Issues' : 'Import Successful'}
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">{importResults.categoriesCreated}</div>
                <div className="text-xs text-gray-400">Categories Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">{importResults.productsCreated}</div>
                <div className="text-xs text-gray-400">Products Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-400">{importResults.categoriesSkipped}</div>
                <div className="text-xs text-gray-400">Categories Skipped</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-400">{importResults.productsSkipped}</div>
                <div className="text-xs text-gray-400">Products Skipped</div>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="text-sm text-red-400 mb-2">Errors:</div>
                <ul className="text-sm text-red-300 space-y-1">
                  {importResults.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {importResults.warnings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="text-sm text-amber-400 mb-2">Warnings:</div>
                <ul className="text-sm text-amber-300 space-y-1">
                  {importResults.warnings.map((warn, i) => (
                    <li key={i}>• {warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
            >
              Import Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}