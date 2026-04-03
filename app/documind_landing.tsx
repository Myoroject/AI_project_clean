import React, { useState, useRef } from 'react';
import { FileText, Upload, Lock, Shield, Building2, Search, Moon, Sun, X, ChevronRight } from 'lucide-react';

const Documind = () => {
  const [isDark, setIsDark] = useState(false);
  const [currentPage, setCurrentPage] = useState('landing');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const fileInputRef = useRef(null);

  const mockResults = [
    {
      id: 1,
      title: 'Q3 2024 Financial Report',
      snippet: 'Total revenue increased by 23% year-over-year, reaching $4.2M in Q3. Operating expenses remained stable at 18% of revenue...',
      page: 3,
      relevance: 98
    },
    {
      id: 2,
      title: 'Investment Portfolio Summary',
      snippet: 'Asset allocation: 60% equities, 30% fixed income, 10% alternative investments. Portfolio performance exceeded benchmark by 2.3%...',
      page: 7,
      relevance: 94
    },
    {
      id: 3,
      title: 'Risk Assessment Documentation',
      snippet: 'Credit risk metrics show improvement across all categories. Default probability reduced to 0.8% from previous 1.2%...',
      page: 12,
      relevance: 89
    }
  ];

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
      if (files.length > 1) {
        showToastMessage();
      }
    }
  };

  const handleFileSelect = (file) => {
    setUploadedFile(file);
    setTimeout(() => {
      setCurrentPage('search');
    }, 800);
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
      if (files.length > 1) {
        showToastMessage();
      }
    }
  };

  const showToastMessage = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchResults(mockResults);
    }
  };

  const handleBackToHome = () => {
    setCurrentPage('landing');
    setUploadedFile(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const bgClass = isDark ? 'bg-slate-950' : 'bg-white';
  const textPrimary = isDark ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-500';
  const borderClass = isDark ? 'border-slate-800' : 'border-slate-200';
  const hoverBg = isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-50';

  if (currentPage === 'search') {
    return (
      <div className={`min-h-screen ${bgClass} transition-colors duration-300`}>
        {/* Header */}
        <header className={`border-b ${borderClass} sticky top-0 ${bgClass} z-10 backdrop-blur-sm bg-opacity-80`}>
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={handleBackToHome}
                className={`${textSecondary} ${hoverBg} p-2 rounded-lg transition-all`}
              >
                <X className="w-5 h-5" />
              </button>
              <div>
                <h1 className={`text-xl font-semibold ${textPrimary}`}>Documind</h1>
                <p className={`text-sm ${textSecondary}`}>{uploadedFile?.name}</p>
              </div>
            </div>
            <button
              onClick={() => setIsDark(!isDark)}
              className={`p-2 rounded-lg ${hoverBg} ${textSecondary} transition-all`}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Search Section */}
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="mb-12">
            <div className={`relative group ${isDark ? 'bg-slate-900' : 'bg-slate-50'} rounded-2xl border-2 ${borderClass} transition-all focus-within:border-emerald-500 focus-within:shadow-lg focus-within:shadow-emerald-500/10`}>
              <Search className={`absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 ${textSecondary} transition-colors group-focus-within:text-emerald-500`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                placeholder="Ask a question about your document..."
                className={`w-full pl-16 pr-6 py-5 bg-transparent ${textPrimary} text-lg placeholder:${textSecondary} outline-none`}
              />
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-4 animate-fadeIn">
              <p className={`text-sm ${textSecondary} mb-6`}>
                Found {searchResults.length} results
              </p>
              
              {searchResults.map((result, index) => (
                <div
                  key={result.id}
                  className={`${isDark ? 'bg-slate-900' : 'bg-slate-50'} rounded-xl p-6 border ${borderClass} ${hoverBg} cursor-pointer transition-all hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/5 group`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <FileText className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div>
                        <h3 className={`font-semibold ${textPrimary} group-hover:text-emerald-500 transition-colors`}>
                          {result.title}
                        </h3>
                        <p className={`text-sm ${textSecondary}`}>Page {result.page}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">
                        {result.relevance}% match
                      </span>
                      <ChevronRight className={`w-4 h-4 ${textSecondary} opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1`} />
                    </div>
                  </div>
                  <p className={`${textSecondary} text-sm leading-relaxed`}>
                    {result.snippet}
                  </p>
                </div>
              ))}
            </div>
          )}

          {searchQuery && searchResults.length === 0 && (
            <div className="text-center py-20">
              <div className={`inline-flex p-4 rounded-full ${isDark ? 'bg-slate-900' : 'bg-slate-100'} mb-4`}>
                <Search className={`w-8 h-8 ${textSecondary}`} />
              </div>
              <p className={`${textSecondary}`}>Press Enter to search your document</p>
            </div>
          )}

          {!searchQuery && (
            <div className="text-center py-20">
              <div className={`inline-flex p-4 rounded-full ${isDark ? 'bg-slate-900' : 'bg-slate-100'} mb-4`}>
                <Search className={`w-8 h-8 ${textSecondary}`} />
              </div>
              <p className={`${textPrimary} font-medium mb-2`}>Start searching</p>
              <p className={`${textSecondary} text-sm`}>Ask questions about {uploadedFile?.name}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bgClass} transition-colors duration-300 flex flex-col`}>
      {/* Header */}
      <header className="absolute top-0 right-0 p-6">
        <button
          onClick={() => setIsDark(!isDark)}
          className={`p-3 rounded-xl ${hoverBg} ${textSecondary} transition-all hover:scale-105`}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-3xl w-full text-center space-y-12 animate-fadeIn">
          {/* Hero Section */}
          <div className="space-y-4">
            <h1 className={`text-5xl md:text-6xl font-bold ${textPrimary} leading-tight tracking-tight`}>
              Find answers inside your documents. Instantly.
            </h1>
            <p className={`text-xl ${textSecondary} max-w-2xl mx-auto`}>
              Private. Local. Your financial data never leaves your machine.
            </p>
          </div>

          {/* Upload Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              max-w-2xl mx-auto p-16 rounded-2xl border-2 border-dashed 
              ${isDragging ? 'border-emerald-500 bg-emerald-500/5 shadow-2xl shadow-emerald-500/20' : borderClass}
              ${isDark && !isDragging ? 'bg-slate-900/50' : ''}
              ${!isDark && !isDragging ? 'bg-slate-50' : ''}
              transition-all duration-300 cursor-pointer
              hover:border-emerald-500 hover:bg-emerald-500/5 hover:shadow-xl hover:shadow-emerald-500/10
              group
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.xlsx"
              onChange={handleFileInputChange}
              className="hidden"
            />
            
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-4">
                <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} transition-all group-hover:scale-110`}>
                  <FileText className="w-8 h-8 text-emerald-500" />
                </div>
                <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-white'} transition-all group-hover:scale-110 delay-75`}>
                  <Upload className="w-8 h-8 text-emerald-500" />
                </div>
              </div>
              
              <div className="space-y-2">
                <p className={`text-lg font-medium ${textPrimary}`}>
                  Drag & drop or click to browse
                </p>
                <p className={`text-sm ${textSecondary}`}>
                  Supports PDF, CSV, XLSX
                </p>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="flex items-center justify-center gap-12 pt-8">
            <div className="flex items-center gap-3 group">
              <div className="p-2 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                <Lock className="w-5 h-5 text-emerald-600" />
              </div>
              <span className={`text-sm font-medium ${textSecondary}`}>
                Processed Locally
              </span>
            </div>
            
            <div className="flex items-center gap-3 group">
              <div className="p-2 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                <Shield className="w-5 h-5 text-emerald-600" />
              </div>
              <span className={`text-sm font-medium ${textSecondary}`}>
                Enterprise Grade Security
              </span>
            </div>
            
            <div className="flex items-center gap-3 group">
              <div className="p-2 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                <Building2 className="w-5 h-5 text-emerald-600" />
              </div>
              <span className={`text-sm font-medium ${textSecondary}`}>
                Designed for BFSI
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 animate-slideUp">
          <div className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-900 border-slate-800'} text-white px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 max-w-md`}>
            <div className="p-1 bg-blue-500/20 rounded">
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-sm">
              Single file upload enabled. Multi-file selection coming soon.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out forwards;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default Documind;