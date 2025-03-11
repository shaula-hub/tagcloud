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

  const [tagRows, setTagRows] = useState([]);  
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
  
  const tagCloudRef = useRef(null);    
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
    // Add debugging to trace the issue
    console.log("Tag clicked:", tag);
    
    // Critical fix: Move state changes OUTSIDE the throttled update
    setSelectedTag(tag);
    setIsTagView(false); // Explicitly switch to articles view
    
    const updateFn = () => {
      console.log("Filtering articles for tag:", tag);
      const filtered = articles.filter(article => article.tags.includes(tag));
      console.log("Found articles:", filtered.length);
      
      if (filtered.length === 0) {
        console.warn("No articles found for tag:", tag);
      }
      
      setFilteredArticles(filtered);
    };
    
    // Skip throttling on mobile for immediate response
    if (isMobile || isSmallMobile) {
      updateFn(); 
    } else {
      throttledUpdate(updateFn);
    }
  }, [articles, throttledUpdate, isMobile, isSmallMobile]);
  
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
      return 0.3 + percentage * 0.2; // Smallest range for small phones
    } else if (isMobile) {
      return 0.35 + percentage * 0.25; // Medium range for tablets/larger phones
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

  // Function to organize tags into rows, accounting for device type
  const organizeTagsIntoRows = useCallback((tags, containerWidth) => {
    const rows = [];
    let currentRow = [];
    let currentRowWidth = 0;
    const baseCharWidth = isSmallMobile ? 0.55 : isMobile ? 0.6 : 0.65; // Character width in em
    const horizontalPadding = isSmallMobile ? 0.6 : isMobile ? 0.7 : 0.8; // Padding in em
    const marginBetweenTags = 0.4; // 0.2em on each side
    
    // Sort tags by size for better visual arrangement (optional)
    const sortedTags = [...tags].sort((a, b) => b.count - a.count);
    
    sortedTags.forEach(tag => {
      const size = getTagSize(tag.count);
      // Calculate tag width: text width + padding + margins
      const tagWidth = (tag.name.length * baseCharWidth * size) + 
                      (horizontalPadding * 2) + marginBetweenTags;
      
      if (currentRowWidth + tagWidth > containerWidth) {
        // Save current row data including height
        const maxHeight = Math.max(...currentRow.map(t => getTagSize(t.count)));
        rows.push({
          tags: currentRow,
          height: maxHeight
        });
        // Start new row
        currentRow = [tag];
        currentRowWidth = tagWidth;
      } else {
        // Add to current row
        currentRow.push(tag);
        currentRowWidth += tagWidth;
      }
    });
    
    // Add last row if not empty
    if (currentRow.length > 0) {
      const maxHeight = Math.max(...currentRow.map(t => getTagSize(t.count)));
      rows.push({
        tags: currentRow,
        height: maxHeight
      });
    }
    
    return rows;
  }, [isSmallMobile, isMobile, getTagSize]);

  // Total cloud height
  const calculateCloudHeight = useCallback((rows) => {
    // Base font size (1em in px)
    const baseFontSize = isSmallMobile ? 14 : isMobile ? 15 : 16;
    
    // Vertical spacing between rows
    const rowSpacing = isSmallMobile ? 6 : isMobile ? 8 : 10;
    
    // Calculate total height
    const totalHeight = rows.reduce((height, row) => {
      // Convert em to pixels and add line height factor
      const rowHeight = (row.height * baseFontSize * 1.3) + rowSpacing;
      return height + rowHeight;
    }, 0);
    
    // Add padding
    const verticalPadding = isSmallMobile ? 20 : isMobile ? 30 : 40;
    return totalHeight + (verticalPadding * 2);
  }, [isSmallMobile, isMobile]);

  // Minimum height values based on device type
  const getMinCloudHeight = useCallback(() => {
    return isSmallMobile ? 200 : isMobile ? 250 : 300;
  }, [isSmallMobile, isMobile]);

  // Effect to calculate and set cloud height
  useEffect(() => {
    if (categoryTags.length === 0) {
      // Set minimum height for empty cloud
      setTagCloudHeight(`${getMinCloudHeight()}px`);
      return;
    }
    
    // Get container width from ref or estimate based on device
    const containerWidth = tagCloudRef.current?.clientWidth || 
      (isSmallMobile ? 300 : isMobile ? 400 : 600);
    
    // Organize tags into rows
    const rows = organizeTagsIntoRows(categoryTags, containerWidth);
    
    // Calculate height
    const calculatedHeight = calculateCloudHeight(rows);
    const minHeight = getMinCloudHeight();
    
    // Use the larger of calculated or minimum height
    const finalHeight = Math.max(calculatedHeight, minHeight);
    
    // Store rows data if needed for rendering
    setTagRows(rows);
    
    // Set tag cloud height
    setTagCloudHeight(`${finalHeight}px`);
  }, [categoryTags, isSmallMobile, isMobile, organizeTagsIntoRows, calculateCloudHeight, getMinCloudHeight]);

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
      // Base height calculations adjusted for potentially longer tag text
      const baseHeight = isSmallMobile ? 320 : isMobile ? 360 : 400; 
      const heightPerTag = isSmallMobile ? 30 : isMobile ? 35 : 40;
      
      // Increase height factor for more tags to account for potentially longer text
      const additionalHeightFactor = 0.5; // Increased from 0.25 to 0.5
      
      const neededHeight = Math.min(
        baseHeight + (categoryTags.length > 20 ? 
          (categoryTags.length - 20) * heightPerTag * additionalHeightFactor : 0),
        isSmallMobile ? 600 : isMobile ? 700 : 800 // Maximum height increased
      );
      
      setTagCloudHeight(`${neededHeight}px`);
    };
    
    calculateTagCloudHeight();
  }, [categoryTags, isMobile, isSmallMobile]);

  // Calculate how many category buttons can fit - with throttling to improve performance
  useEffect(() => {
    // Throttled calculation function to prevent excessive re-renders
    const calculateVisibleCategories = () => {
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
      }
      
      throttleTimeout.current = setTimeout(() => {
        if (categoriesContainerRef.current) {
          const containerWidth = categoriesContainerRef.current.offsetWidth;
          // Reduce estimated button width to fit more buttons
          const buttonWidth = isSmallMobile ? 70 : isMobile ? 90 : 120;
          // Reserve less space for scroll button
          const scrollButtonWidth = isSmallMobile ? 30 : 50;
          const availableWidth = containerWidth - scrollButtonWidth;
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
  }, [isMobile, isSmallMobile]);

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
            fontSize: isSmallMobile ? '1.25rem' : isMobile ? '1.75rem' : '1.875rem' 
          }}
        >
          {isTagView ? channelConfig.title : selectedTag}
        </h1>

        {/* Category navigation - Always visible */}
        <div 
          ref={categoriesContainerRef}
          className="categories-container flex mb-8 relative"
          style={{
            gap: isSmallMobile ? '0.2rem' : isMobile ? '0.3rem' : '0.8rem',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '4px',
            // Only use space-between on desktop when buttons fit
            justifyContent: (!isMobile && categories.length <= maxVisibleCategories) 
              ? 'space-between' 
              : 'flex-start'
          }}
        >
          {getVisibleCategories().map((category, index) => (
            <button
              key={index}
              className={`category-button ${selectedCategory === category ? 'active' : ''}`}
              style={{
                fontSize: isSmallMobile ? '0.7rem' : isMobile ? '0.75rem' : '0.85rem',
                padding: isSmallMobile ? '0.3rem 0.5rem' : isMobile ? '0.4rem 0.6rem' : '0.5rem 0.8rem',
                minHeight: '32px',
                minWidth: isSmallMobile ? '60px' : isMobile ? '80px' : '100px',
                maxWidth: isSmallMobile ? '100px' : isMobile ? '120px' : '150px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 0,
                backgroundColor: '#14294f', // Navy blue background
                color: 'white', // White text for contrast
                border: '1px solid #0a1c38',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
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
                padding: isSmallMobile ? '0.2rem' : '0.3rem',
                width: isSmallMobile ? '28px' : '40px',
                height: isSmallMobile ? '28px' : '40px',
                minWidth: isSmallMobile ? '28px' : '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#14294f', // Navy blue
                color: 'white',
                borderRadius: '4px',
                flexShrink: 0,
                border: '1px solid #0a1c38'
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
              className="w-full rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                fontSize: isSmallMobile ? '0.7rem' : isMobile ? '0.75rem' : '1rem', // Half size on mobile
                padding: isSmallMobile ? '0.5rem 0.5rem 0.5rem 2rem' : isMobile ? '0.6rem 0.6rem 0.6rem 2.2rem' : '0.75rem 0.75rem 0.75rem 2.5rem',
              }}
              autoComplete="off"
            />
            <svg 
              className="absolute text-gray-400" 
              style={{
                left: isSmallMobile ? '0.5rem' : isMobile ? '0.6rem' : '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: isSmallMobile ? '1rem' : isMobile ? '1.1rem' : '1.25rem',
                height: isSmallMobile ? '1rem' : isMobile ? '1.1rem' : '1.25rem',
              }}
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
              ref={tagCloudRef}
              className="tag-cloud-bubble flex flex-wrap justify-center items-start overflow-auto" 
              style={{ 
                height: tagCloudHeight,
                width: isSmallMobile ? '100%' : isMobile ? '90%' : '80%',
                padding: isSmallMobile ? '0.8rem 0.3rem' : isMobile ? '1rem 0.5rem' : '2rem 1rem',
                marginTop: 0,
                position: 'relative',
                overflowY: 'auto',
                border: '1px solid #eaeaea',
                borderRadius: '8px',
                backgroundColor: '#f9f9f9'
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
                        padding: isSmallMobile ? '0.12em 0.3em' : isMobile ? '0.15em 0.35em' : '0.2em 0.4em',
                        margin: '0.2em',
                        lineHeight: '1.3',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'inline-block',
                        // Remove truncation styles
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        border: '1px solid #e8e8e8'
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
          // Articles View
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
                      <span 
                        className="line-clamp-2"
                        style={{ 
                          fontSize: isSmallMobile ? '0.9rem' : isMobile ? '0.95rem' : '1.1rem'
                        }}
                      >
                        {article.title}
                      </span>                   
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