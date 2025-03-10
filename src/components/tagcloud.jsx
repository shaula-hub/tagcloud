import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import './TagCloud.css';
import wowmindChannel from '../channels/wowmind.js';
import aitmirChannel from '../channels/aitmir.js';
import blogemChannel from '../channels/blogem.js';

const CHANNELS = {
  wowmind: wowmindChannel,
  aitmir: aitmirChannel,
  blogem: blogemChannel
};

const TagCloud = ({ channelId = 'wowmind' }) => {
  const useScreenSize = () => {
    const [screenSize, setScreenSize] = useState({
      width: typeof window !== 'undefined' ? window.innerWidth : 1024,
      isMobile: typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
      isSmallMobile: typeof window !== 'undefined' ? window.innerWidth <= 480 : false
    });
    
    useEffect(() => {
      const handleResize = () => {
        setScreenSize({
          width: window.innerWidth,
          isMobile: window.innerWidth <= 768,
          isSmallMobile: window.innerWidth <= 480
        });
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);
    
    return screenSize;
  };

  // Get channel configuration or fall back to default
  const channelConfig = CHANNELS[channelId] || CHANNELS.wowmind;
  
  const { width, isMobile, isSmallMobile } = useScreenSize();
  
  const [articles, setArticles] = useState([]);
  const [filteredArticles, setFilteredArticles] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTag, setSelectedTag] = useState(null);
  const [isTagView, setIsTagView] = useState(true); // Start with Tag Cloud view
  const [scrollOffset, setScrollOffset] = useState(0);
  const [allTags, setAllTags] = useState([]);
  const [categoryTags, setCategoryTags] = useState([]);
  const [tagCloudHeight, setTagCloudHeight] = useState('24rem');

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [popularSearches, setPopularSearches] = useState([]);
  const searchInputRef = useRef(null);  
  
  // Prevent unnecessary re-renders with useRef instead of state where possible
  const categoriesContainerRef = useRef(null);
  const [maxVisibleCategories, setMaxVisibleCategories] = useState(5);
  
  // Throttle resize calculations to improve performance
  const throttleTimeout = useRef(null);
  
  // Limit updates to 1Hz with this ref
  const lastUpdateTime = useRef(Date.now());
  const pendingUpdate = useRef(null);

  window.addEventListener('load', () => {
    console.clear();
  });  


  // Throttled state update function - limits updates to 1Hz (1000ms)
  const throttledUpdate = useCallback((updateFn) => {
    const now = Date.now();
    const timeElapsed = now - lastUpdateTime.current;
    
    // If a pending update exists, clear it
    if (pendingUpdate.current) {
      clearTimeout(pendingUpdate.current);
    }
    
    if (timeElapsed >= 1000) {
      // It's been at least 1 second since the last update
      updateFn();
      lastUpdateTime.current = now;
    } else {
      // Schedule the update to happen after the remaining time
      pendingUpdate.current = setTimeout(() => {
        updateFn();
        lastUpdateTime.current = Date.now();
        pendingUpdate.current = null;
      }, 1000 - timeElapsed);
    }
  }, []);

  // Filter articles by category and update tags - throttled to 1Hz
  const filterByCategory = useCallback((category) => {
    setSelectedCategory(category);
    setIsTagView(true); // Switch to tag view
    setSelectedTag(null); // Clear selected tag
    
    // Create the update function
    const updateFn = () => {
      if (category === 'All') {
        setFilteredArticles(articles);
        // Update tag cloud with all tags
        setCategoryTags(allTags);
      } else {
        const filtered = articles.filter(article => 
          article.categories.includes(category)
        );
        
        setFilteredArticles(filtered);
        
        // Update tag cloud with only tags from this category
        const categoryTagsList = filtered.flatMap(article => article.tags);
        const tagCounts = {};
        
        // More efficient counting
        for (const tag of categoryTagsList) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
        
        const tagsArray = Object.keys(tagCounts).map(tag => ({
          name: tag,
          count: tagCounts[tag]
        }));
        
        setCategoryTags(tagsArray);
      }
    };
    
    // Apply the throttled update
    throttledUpdate(updateFn);
  }, [articles, allTags, throttledUpdate]);

  // Filter articles by tag - throttled to 1Hz
  const filterByTag = useCallback((tag) => {
    setSelectedTag(tag);
    setIsTagView(false); // Switch to articles view
    
    // Create the update function
    const updateFn = () => {
      // Direct filtering without unnecessary operations
      setFilteredArticles(articles.filter(article => 
        article.tags.includes(tag)
      ));
    };
    
    // Apply the throttled update
    throttledUpdate(updateFn);
  }, [articles, throttledUpdate]);
  
  // Go back to tag cloud view - memoized
  const goBackToTagCloud = useCallback(() => {
    setIsTagView(true);
    setSelectedTag(null);
    
    // Use the current category - no need to recalculate everything
    if (selectedCategory === 'All') {
      setFilteredArticles(articles);
      setCategoryTags(allTags);
    } else {
      // Reuse existing filtered articles for the selected category
      filterByCategory(selectedCategory);
    }
  }, [selectedCategory, articles, allTags, filterByCategory]);

  // Navigate categories (scroll)
  const shiftCategories = () => {
    // Calculate maximum possible offset (categories length minus visible slots plus 1 for All)
    const maxOffset = Math.max(0, categories.length - maxVisibleCategories + 1);
    
    // Increment offset but wrap around when we reach the end
    setScrollOffset((prev) => {
      // If we're about to go beyond the max, return to start
      if (prev >= maxOffset - 1) {
        return 0;
      } else {
        // Otherwise, increment
        return prev + 1;
      }
    });
  };

  const getVisibleCategories = () => {
    // Always include "All" as the first visible button
    if (scrollOffset === 0) {
      // If not scrolled, show buttons from the beginning
      return categories.slice(0, maxVisibleCategories);
    } else {
      // If scrolled, always include "All" and then show other buttons based on offset
      return [
        categories[0], // Always include "All" button (first in the array)
        ...categories.slice(scrollOffset + 1, scrollOffset + maxVisibleCategories)
      ];
    }
  };

  // Function to get a tag size based on count - memoized to prevent recalculation on each render
  const tagSizeData = useMemo(() => {
    if (categoryTags.length === 0) return { min: 0, max: 1, range: 1 };
    
    const max = Math.max(...categoryTags.map(t => t.count));
    const min = Math.min(...categoryTags.map(t => t.count));
    const range = max - min || 1;
    
    return { min, max, range };
  }, [categoryTags]);
  
  // Function to determine if a tag is "large" based on frequency
  const isLargeTag = useCallback((count) => {
    if (categoryTags.length === 0) return false;
    
    // Consider a tag "large" if it's in the top 25% of frequency
    const threshold = tagSizeData.min + (tagSizeData.range * 0.75);
    return count >= threshold;
  }, [categoryTags, tagSizeData]);
  
  // Get tag size for tags in the cloud:
  const getTagSize = useCallback((count) => {
    if (categoryTags.length === 0) return 1;
    
    const percentage = (count - tagSizeData.min) / tagSizeData.range;
    
    // Tiered font sizing based on screen width
    if (isSmallMobile) {
      return 0.6 + percentage * 0.4; // Smallest range for small phones
    } else if (isMobile) {
      return 0.7 + percentage * 0.5; // Medium range for tablets/larger phones
    }
    
    // Original desktop size
    return 0.9 + percentage * 0.9; 
  }, [categoryTags, tagSizeData, isMobile, isSmallMobile]);

  // Also, create a function to distribute tag sizes more evenly
  const getDistributedTagSize = useCallback((count) => {
    if (categoryTags.length === 0) return 1;
    
    // Sort tags by count
    const sortedCounts = [...categoryTags].sort((a, b) => a.count - b.count).map(t => t.count);
    
    // Find the index of this count in the sorted list
    const index = sortedCounts.indexOf(count);
    
    // Calculate size based on position in the distribution
    // This creates more evenly distributed sizes
    const position = index / (sortedCounts.length - 1 || 1);
    return 0.9 + position * 0.9; // Range from 0.9em to 1.8em
    
  }, [categoryTags]);

  // SEARCH FUNCTIONALITY
  const handleSearch = useCallback((event) => {
    const term = event.target.value;
    setSearchTerm(term);
    
    // If search term is empty, exit search mode
    if (!term.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }
    
    // Generate suggestions immediately (no throttling needed here)
    const lowerTerm = term.toLowerCase();
    
    // Get tag suggestions
    const tagSuggestions = allTags
      .filter(tag => tag.name.toLowerCase().includes(lowerTerm))
      .slice(0, 3)
      .map(tag => ({ 
        value: tag.name, 
        type: 'tag', 
        count: tag.count 
      }));
    
    // Get category suggestions
    const categorySuggestions = categories
      .filter(category => category.toLowerCase().includes(lowerTerm) && category !== 'All')
      .slice(0, 2)
      .map(category => ({ 
        value: category, 
        type: 'category' 
      }));
    
    // Get article title suggestions
    const titleSuggestions = articles
      .filter(article => article.title.toLowerCase().includes(lowerTerm))
      .slice(0, 3)
      .map(article => ({ 
        value: article.title, 
        type: 'article',
        id: article.id || articles.indexOf(article)
      }));
    
    // Combine all suggestions
    const combinedSuggestions = [...tagSuggestions, ...categorySuggestions, ...titleSuggestions];
    
    setSearchSuggestions(combinedSuggestions);
    setShowSuggestions(combinedSuggestions.length > 0);
    
    // Throttled search for article results
    setIsSearching(true);
    
    const updateFn = () => {
      // Search in article titles, excerpts, tags, and categories
      const results = articles.filter(article => 
        article.title.toLowerCase().includes(lowerTerm) ||
        article.excerpt.toLowerCase().includes(lowerTerm) ||
        article.tags.some(tag => tag.toLowerCase().includes(lowerTerm)) ||
        article.categories.some(cat => cat.toLowerCase().includes(lowerTerm))
      );
      
      setSearchResults(results);
    };
    
    throttledUpdate(updateFn);
  }, [articles, allTags, categories, throttledUpdate]);

  // Function to save search term to history
  const saveSearchToHistory = (term) => {
    if (!term.trim()) return;
    
    try {
      // Get existing search history
      const savedSearches = localStorage.getItem('tagCloudSearchHistory') || '{}';
      const parsedSearches = JSON.parse(savedSearches);
      
      // Increment count for this term
      parsedSearches[term] = (parsedSearches[term] || 0) + 1;
      
      // Save back to localStorage
      localStorage.setItem('tagCloudSearchHistory', JSON.stringify(parsedSearches));
      
      // Update popular searches
      const sortedSearches = Object.entries(parsedSearches)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([term]) => term);
      
      setPopularSearches(sortedSearches);
    } catch (e) {
      console.error('Error saving search history:', e);
    }
  };

  // Function to handle selecting a suggestion
  const handleSelectSuggestion = (suggestion) => {
    // Save to search history
    saveSearchToHistory(suggestion.value);
    
    // Close suggestions
    setShowSuggestions(false);
    
    if (suggestion.type === 'tag') {
      // Direct to tag view
      filterByTag(suggestion.value);
      setSearchTerm('');
      setIsSearching(false);
    } else if (suggestion.type === 'category') {
      // Direct to category view
      filterByCategory(suggestion.value);
      setSearchTerm('');
      setIsSearching(false);
    } else if (suggestion.type === 'article') {
      // Set search term to the article title but stay in search view
      setSearchTerm(suggestion.value);
      // Filter results to just this article
      setSearchResults(articles.filter(article => 
        article.id === suggestion.id || 
        article.title === suggestion.value
      ));
    }
  };

  // Function to highlight search terms in text
  const highlightText = (text, searchTerm) => {
    if (!searchTerm.trim() || !text) return text;
    
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    
    return parts.map((part, index) => 
      part.toLowerCase() === searchTerm.toLowerCase() 
        ? <span key={index} className="search-highlight">{part}</span> 
        : part
    );
  };

  const getButtonTextSize = useCallback(() => {
    if (isSmallMobile) {
      return '0.8rem'; // Smallest text for small phones
    } else if (isMobile) {
      return '0.85rem'; // Medium text for tablets/larger phones
    }
    
    // Original desktop size
    return '1rem';
  }, [isMobile, isSmallMobile]);
  
  // 5. Add a function to calculate button padding based on screen size
  const getButtonPadding = useCallback(() => {
    if (isSmallMobile) {
      return '0.35rem 0.6rem'; // Smallest padding for small phones
    } else if (isMobile) {
      return '0.45rem 0.8rem'; // Medium padding for tablets/larger phones
    }
    
    // Original desktop size
    return '0.6rem 1rem';
  }, [isMobile, isSmallMobile]);

  // Popular searches
  useEffect(() => {
    // Track search history in localStorage
    const savedSearches = localStorage.getItem('tagCloudSearchHistory');
    if (savedSearches) {
      try {
        const parsedSearches = JSON.parse(savedSearches);
        // Get the most popular searches based on count
        const sortedSearches = Object.entries(parsedSearches)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([term]) => term);
        
        setPopularSearches(sortedSearches);
      } catch (e) {
        console.error('Error parsing saved searches:', e);
      }
    }
  }, []);

  // Tag cloud height calculation
  useEffect(() => {
    const calculateTagCloudHeight = () => {
      // Responsive height based on screen size
      const baseHeight = isSmallMobile ? 280 : isMobile ? 320 : 384;
      const heightPerTag = isSmallMobile ? 25 : isMobile ? 30 : 40;
      const maxHeight = isSmallMobile ? 500 : isMobile ? 600 : 800;
      
      const neededHeight = Math.min(
        baseHeight + (categoryTags.length > 20 ? (categoryTags.length - 20) * heightPerTag/4 : 0),
        maxHeight
      );
      
      setTagCloudHeight(`${neededHeight}px`);
    };
    
    calculateTagCloudHeight();
  }, [categoryTags, isMobile, isSmallMobile]);

  // Calculate how many category buttons can fit - with throttling to improve performance
  useEffect(() => {
    // Throttled calculation function to prevent excessive re-renders
    const calculateVisibleCategories = () => {
      // Clear any existing timeout
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
      }
      
      // Set a new timeout - only update after 150ms of inactivity
      throttleTimeout.current = setTimeout(() => {
        if (categoriesContainerRef.current) {
          const containerWidth = categoriesContainerRef.current.offsetWidth;
          // Estimate button width (including margin) as 140px
          const buttonWidth = 140;
          // Reserve 50px for the scroll button
          const availableWidth = containerWidth - 50;
          const buttonsCount = Math.floor(availableWidth / buttonWidth);
          setMaxVisibleCategories(Math.max(1, buttonsCount));
        }
      }, 150);
    };

    // Calculate once on mount
    calculateVisibleCategories();
    
    // Add throttled event listener
    window.addEventListener('resize', calculateVisibleCategories);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', calculateVisibleCategories);
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
      }
      if (pendingUpdate.current) {
        clearTimeout(pendingUpdate.current);
      }
    };
  }, []);

  // Load and parse the CSV file - run only once on component mount
  useEffect(() => {
    const loadData = async () => {
      try {

        // console.warn('channelConfig.dataFile: ', channelConfig.dataFile);

        const response = await fetch(channelConfig.dataFile);
        const csvText = await response.text();

        // console.warn('csvText read:', csvText);

        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          delimiter: '^', 
          complete: (results) => {
            if (results.data && results.data.length > 0) {
              // Process articles - do this processing once
              const articlesData = results.data.map(item => ({
                ...item,
                categories: item.categories.split(' '),
                tags: item.tags.split(' ')
              }));
              
              // Set state updates in batch to reduce renders
              setArticles(articlesData);
              setFilteredArticles(articlesData);
              
              // Extract unique categories
              const uniqueCategories = ['All', ...new Set(
                articlesData.flatMap(article => article.categories)
              )];
              setCategories(uniqueCategories);
              
              // Extract all tags
              const tags = articlesData.flatMap(article => article.tags);
              const tagCounts = tags.reduce((acc, tag) => {
                acc[tag] = (acc[tag] || 0) + 1;
                return acc;
              }, {});
              
              const tagsArray = Object.keys(tagCounts).map(tag => ({
                name: tag,
                count: tagCounts[tag]
              }));
              
              // Set both tag states at once
              setAllTags(tagsArray);
              setCategoryTags(tagsArray); // Initialize with all tags
            }
          },
          error: (error) => {
            console.error('Error parsing CSV:', error);
          }
        });
      } catch (error) {
        console.error('Error fetching the CSV file:', error);
      }
    };
    
    // Load data only once when component mounts
    loadData();
  }, [channelConfig.dataFile]);
  

  return (
    <div className="tag-cloud-container">
      {/* Main container */}
      <div className="container mx-auto p-4">
        {/* Back button - visible only in articles view */}
        {!isTagView && (
          <button 
            onClick={goBackToTagCloud}
            aria-label="Back to tag cloud"
            className="back-button flex items-center mb-4"
            style={{
              fontSize: isSmallMobile ? '0.9rem' : isMobile ? '1rem' : '1.1rem'
            }}
          >
            <span className="font-bold mr-2" style={{ fontSize: '1.5em' }}>←</span> Обратно к облаку меток
          </button>
        )}        

        {/* Page title */}
        <h1 
          className="tag-cloud-title font-bold text-center mb-4"
          style={{ 
            fontSize: isSmallMobile ? '2.5rem' : isMobile ? '3.5rem' : '3.75rem' 
          }}
        >
          {isTagView ? channelConfig.title : selectedTag}
        </h1>

        {/* Category navigation - Always visible */}
        <div 
          ref={categoriesContainerRef}
          className="categories-container flex mb-8 overflow-hidden relative"
          style={{
            gap: isSmallMobile ? '0.3rem' : '0.5rem'
          }}
        >
          {getVisibleCategories().map((category, index) => (
            <button
              key={index}
              className={`category-button ${selectedCategory === category ? 'active' : ''}`}
              style={{
                fontSize: getButtonTextSize(),
                padding: getButtonPadding(),
                height: isSmallMobile ? 'auto' : 'auto',
                minWidth: isSmallMobile ? '4rem' : isMobile ? '5rem' : '6rem',
                // Ensure text fits by allowing wrapping if needed
                whiteSpace: 'normal',
                lineHeight: '1.2'
              }}
              onClick={() => filterByCategory(category)}
            >
              {category}
            </button>
          ))}
          
          {categories.length > maxVisibleCategories && (
            <button 
              className="scroll-button ml-auto"
              style={{
                padding: isSmallMobile ? '0.25rem' : isMobile ? '0.3rem' : '0.4rem',
                fontSize: isSmallMobile ? '0.8rem' : isMobile ? '0.9rem' : '1rem'
              }}
              onClick={shiftCategories}
              aria-label="Show more categories"
            >
              <span className="scroll-arrow">▶</span>
            </button>
          )}
        </div>     

        {/* SEARCH FUNCTIONALITY */}        
        <div className="search-container mb-6 w-full flex flex-col justify-center relative">
          <div className="relative w-full max-w-xl mx-auto">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              placeholder="Поиск по тегам, категориям и анонсам статей..."
              className="w-full p-3 pl-10 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
            />
            <svg 
              className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="2" 
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setIsSearching(false);
                  setSearchResults([]);
                  setShowSuggestions(false);
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
            
            {/* Popular searches */}
            {!searchTerm && popularSearches.length > 0 && (
              <div className="popular-searches mt-2 flex flex-wrap justify-center gap-2">
                <span className="text-sm text-gray-500" style={{ 
                  fontSize: isSmallMobile ? '0.75rem' : isMobile ? '0.8rem' : '0.875rem' 
                }}>
                  Популярные поиски:
                </span>
                {popularSearches.map((term, index) => (
                  <button 
                    key={index}
                    onClick={() => {
                      setSearchTerm(term);
                      handleSearch({ target: { value: term } });
                      saveSearchToHistory(term);
                    }}
                    style={{
                      fontSize: isSmallMobile ? '0.75rem' : isMobile ? '0.8rem' : '0.875rem',
                      padding: isSmallMobile ? '0.25rem 0.5rem' : isMobile ? '0.3rem 0.6rem' : '0.35rem 0.7rem',
                      borderRadius: '9999px'
                    }}
                    className="bg-gray-100 hover:bg-gray-200"
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Search suggestions dropdown */}
          {showSuggestions && (
            <div className="search-suggestions w-full max-w-xl mx-auto bg-white z-10">
              {searchSuggestions.map((suggestion, index) => (
                <div 
                  key={index}
                  className="suggestion-item p-3 border-b border-gray-100 flex items-center justify-between"
                  onClick={() => handleSelectSuggestion(suggestion)}
                >
                  <div className="flex items-center">
                    {/* Icon based on suggestion type */}
                    {suggestion.type === 'tag' && (
                      <span className="mr-2 text-blue-500">#</span>
                    )}
                    {suggestion.type === 'category' && (
                      <span className="mr-2 text-purple-500">◉</span>
                    )}
                    {suggestion.type === 'article' && (
                      <span className="mr-2 text-gray-500">📄</span>
                    )}
                    
                    {/* Suggestion text with highlighting */}
                    <span>{highlightText(suggestion.value, searchTerm)}</span>
                  </div>
                  
                  {/* Badge indicator */}
                  {suggestion.type === 'tag' && (
                    <span className="search-tag-indicator">тег ({suggestion.count})</span>
                  )}
                  {suggestion.type === 'category' && (
                    <span className="search-category-indicator">категория</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {isSearching ? (
          // Search Results View
          <div>
            <h2 className="text-2xl font-bold mb-4">Результаты поиска: {searchResults.length} {searchResults.length === 1 ? 'статья' : 'статей'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {searchResults.length > 0 ? (
                searchResults.map((article, index) => (
                  <div key={index} className="article-card search-results-article">
                    <div className="article-image-container overflow-hidden">
                      <div className="w-full h-full relative">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span>Loading...</span>
                        </div>
                        <img 
                          src={article.picture_link 
                            ? `${channelConfig.imagesPath}${article.picture_link}` 
                            : channelConfig.placeholderImage}
                          alt={article.title}
                          className="w-full h-full object-cover relative z-10"
                          loading="lazy"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = channelConfig.placeholderImage;
                          }}
                        />
                      </div>
                    </div>
                    <div className="article-title-container overflow-hidden">
                      <div className="w-full text-center">
                        <span className="line-clamp-2">
                          {highlightText(article.title, searchTerm)}
                        </span>
                      </div>
                    </div>
                    <div className="article-excerpt-container overflow-hidden text-sm">
                      <div className="w-full">
                        <span className="line-clamp-5">
                          {highlightText(article.excerpt, searchTerm)}
                        </span>
                      </div>
                    </div>
                    <div className="article-button-container">
                      <a 
                        href={article.url} 
                        className="read-more-button"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: isSmallMobile ? '0.8rem' : isMobile ? '0.9rem' : '1rem',
                          padding: isSmallMobile ? '0.35rem 0.8rem' : isMobile ? '0.45rem 1rem' : '0.5rem 1.2rem',
                          borderRadius: '4px'
                        }}
                      >
                        Читать
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8">
                  <p className="empty-state">Ничего не найдено по запросу: {searchTerm}</p>
                </div>
              )}
            </div>
          </div>
        ) : isTagView ? (
          // Tag Cloud View
          <div className="flex justify-center items-center">
            <div 
              className="tag-cloud-bubble flex flex-wrap justify-center items-center overflow-auto" 
              style={{ 
                height: tagCloudHeight,
                width: isSmallMobile ? '100%' : isMobile ? '90%' : '80%',
                padding: isSmallMobile ? '0.8rem 0.3rem' : isMobile ? '1rem 0.5rem' : '2rem 1rem'
              }}
            >
              {categoryTags.length > 0 ? (
                categoryTags.map((tag, index) => {
                  const size = getTagSize(tag.count);
                  
                  return (
                    <span 
                      key={index}
                      className={`tag-item ${isLargeTag(tag.count) ? 'large' : ''}`}
                      style={{ 
                        fontSize: `${size}em`,
                        backgroundColor: isLargeTag(tag.count) ? '#e6f7ff' : 'white',
                        padding: isSmallMobile ? '0.1em 0.25em' : isMobile ? '0.15em 0.3em' : '0.2em 0.4em',
                        margin: isSmallMobile ? '0.03em' : isMobile ? '0.05em' : '0.1em',
                        lineHeight: isSmallMobile ? '1' : '1.1',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'inline-block'
                      }}
                      onClick={() => filterByTag(tag.name)}
                    >
                      {tag.name}
                    </span>                    
                  );
                })
              ) : (
                <span className="empty-state">Нет меток для этой категории</span>
              )}
            </div>
          </div>
        ) : (
          // Articles View - Keep your existing code
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredArticles.length > 0 ? (
              filteredArticles.map((article, index) => (
                <div key={index} className="article-card">
                  <div className="article-image-container overflow-hidden">
                    <div className="w-full h-full relative">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span>Loading...</span>
                      </div>
                      <img 
                        src={article.picture_link 
                          ? `${channelConfig.imagesPath}${article.picture_link}` 
                          : channelConfig.placeholderImage}
                        alt={article.title}
                        className="w-full h-full object-cover relative z-10"
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = channelConfig.placeholderImage;
                        }}
                      />
                    </div>
                  </div>
                  <div className="article-title-container overflow-hidden">
                    <div className="w-full text-center">
                      <span className="line-clamp-2">{article.title}</span>
                    </div>
                  </div>
                  <div className="article-excerpt-container overflow-hidden text-sm">
                    <div className="w-full">
                      <span className="line-clamp-5">{article.excerpt}</span>
                    </div>
                  </div>
                  <div className="article-button-container">
                    <a 
                      href={article.url} 
                      className="read-more-button"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Читать
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-8">
                <p className="empty-state">No articles found for tag: {selectedTag}</p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    );
  };

export default TagCloud;