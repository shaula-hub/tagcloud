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

// const logWithTime = (message, ...args) => {
//   const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
//   console.log(`[${timestamp}]`, message, ...args);
// };

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
  const cloudHeightCalculatorRef = useRef(null);
  const [isScrollButtonHovered, setIsScrollButtonHovered] = useState(false);  

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
  
  
  // Total cloud height
  const calculateCloudHeight = useCallback((rows) => {
    // Base font size (1em in px)
    const baseFontSize = isSmallMobile ? 14 : isMobile ? 15 : 16;
    
    // Vertical spacing between rows
    const rowSpacing = isSmallMobile ? 6 : isMobile ? 8 : 10;
    
    // Calculate total height with detailed logs
    const totalHeight = rows.reduce((height, row) => {
      // const totalHeight = rows.reduce((height, row, index) => {
      // Convert em to pixels and add line height factor
      const rowHeight = (row.height * baseFontSize * 1.3) + rowSpacing;
      return height + rowHeight;
    }, 0);
    
    // Add padding
    const verticalPadding = isSmallMobile ? 20 : isMobile ? 30 : 40;
    const result = totalHeight + (verticalPadding * 2);
    
    return result;
  }, [isSmallMobile, isMobile]);
  
  // 2. Then the useEffect that references it
  useEffect(() => {
    cloudHeightCalculatorRef.current = calculateCloudHeight;
  }, [calculateCloudHeight]);
    
  // Minimum height values based on device type
  const getMinCloudHeight = useCallback(() => {
    return isSmallMobile ? 200 : isMobile ? 250 : 300;
  }, [isSmallMobile, isMobile]);

  // Monitoring the DOM directly
  //useEffect(() => {
  //  const interval = setInterval(() => {
  //    if (tagCloudRef.current) {
  //      logWithTime('Actual DOM height:', tagCloudRef.current.offsetHeight);
  //    }
  //  }, 1000);
  //  return () => clearInterval(interval);
  //}, []);

  useEffect(() => {
    cloudHeightCalculatorRef.current = calculateCloudHeight;
  }, [calculateCloudHeight]);


  // Filter articles by category and update tags - throttled to 1Hz
  const filterByCategory = useCallback((category) => {
    setSelectedCategory(category);
    setIsTagView(true); // Switch to tag view
    setSelectedTag(null); // Clear selected tag
    
    // Immediately set the height for "All" category
    if (category === 'All' && tagCloudRef.current) {
      tagCloudRef.current.style.height = '800px';
    }
    
    // Create the update function
    const updateFn = () => {
      if (category === 'All') {
        setFilteredArticles(articles);
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
        
        // Calculate height for non-All categories (after a delay for DOM to update)
        setTimeout(() => {
          if (tagCloudRef.current) {
            const calculatedHeight = Math.max(
              calculateCloudHeight(tagRows), 
              getMinCloudHeight()
            );
            tagCloudRef.current.style.height = `${calculatedHeight}px`;
          }
        }, 100);
      }
    };    
    // Apply the throttled update
    throttledUpdate(updateFn);
  }, [articles, allTags, throttledUpdate, calculateCloudHeight, getMinCloudHeight, tagRows]);
  
  // Filter articles by tag - throttled to 1Hz
  const filterByTag = useCallback((tag) => {
    // Add debugging to trace the issue
    // logWithTime("Tag clicked:", tag);
    
    // Critical fix: Move state changes OUTSIDE the throttled update
    setSelectedTag(tag);
    setIsTagView(false); // Explicitly switch to articles view
    
    const updateFn = () => {
      // logWithTime("Filtering articles for tag:", tag);
      const filtered = articles.filter(article => article.tags.includes(tag));
      // logWithTime("Found articles:", filtered.length);
      
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
  const shiftCategories = useCallback(() => {
    console.log("Shift categories button clicked");    
    
    // Calculate how many regular categories we can show (not including "All")
    const regularCategoriesCount = maxVisibleCategories - 1;
    
    // Calculate the maximum offset value
    // This is the total categories minus "All" minus regularCategoriesCount
    const maxOffset = Math.max(0, categories.length - 1 - regularCategoriesCount);
    
    console.log('Shifting categories, maxOffset:', maxOffset, 'current offset:', scrollOffset);
    
    setScrollOffset(prevOffset => {
      if (prevOffset >= maxOffset) {
        // If we're at the end, go back to the start
        console.log('Resetting to beginning');
        return 0;
      } else {
        // Otherwise increment by 1
        const newOffset = prevOffset + 1;
        console.log('New scrollOffset:', newOffset);
        return newOffset;
      }
    });
  }, [categories.length, maxVisibleCategories, scrollOffset]);

  const getVisibleCategories = useCallback(() => {
    // If all categories fit, show them all
    if (categories.length <= maxVisibleCategories) {
      return categories;
    }
    
    // Calculate how many regular categories we can show (minus All)
    const regularCategoriesCount = maxVisibleCategories - 1;
    
    // Calculate the maximum offset to prevent going past the end
    const maxOffset = Math.max(0, categories.length - regularCategoriesCount - 1);
    
    // Clamp the scroll offset to valid values
    const safeOffset = Math.min(scrollOffset, maxOffset);
    
    if (safeOffset === 0) {
      // Not scrolled, show first batch including "All"
      return categories.slice(0, maxVisibleCategories);
    } else {
      // When scrolled, always include "All" plus categories starting from the offset
      return [
        categories[0], // "All" category
        ...categories.slice(safeOffset + 1, safeOffset + 1 + regularCategoriesCount)
      ];
    }
  }, [categories, maxVisibleCategories, scrollOffset]);

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
  // const getDistributedTagSize = useCallback((count) => {
  //   if (categoryTags.length === 0) return 1;
    
  //   // Sort tags by count
  //   const sortedCounts = [...categoryTags].sort((a, b) => a.count - b.count).map(t => t.count);
    
  //   // Find the index of this count in the sorted list
  //   const index = sortedCounts.indexOf(count);
    
  //   // Calculate size based on position in the distribution
  //   // This creates more evenly distributed sizes
  //   const position = index / (sortedCounts.length - 1 || 1);
  //   return 0.9 + position * 0.9; // Range from 0.9em to 1.8em
    
  // }, [categoryTags]);

// Function to organize tags into rows, accounting for device type
const organizeTagsIntoRows = useCallback((tags, containerWidth) => {
  const rows = [];
  let currentRow = [];
  let currentRowWidth = 0;
  const baseCharWidth = isSmallMobile ? 0.55 : isMobile ? 0.6 : 0.65; // Character width in em
  const horizontalPadding = isSmallMobile ? 0.6 : isMobile ? 0.7 : 0.8; // Padding in em
  const marginBetweenTags = 0.4; // 0.2em on each side
  
  // Hybrid sorting: first by count (descending), then alphabetically for same count
  const sortedTags = [...tags].sort((a, b) => {
    // First sort by count (descending)
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    // Then alphabetically within same count
    return a.name.localeCompare(b.name);
  });
  
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

  console.log("Sorted tags:", sortedTags.map(t => `${t.name} (${t.count})`).slice(0, 10));
  
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

  // Effect to calculate and set cloud height
  useEffect(() => {
    if (categoryTags.length === 0) {
      // logWithTime('No tags - using minimum height');
      const minHeight = getMinCloudHeight();
      // logWithTime(`Minimum height: ${minHeight}px`);
      setTagCloudHeight(`${minHeight}px`);
      return;
    }
    
    // Get container width from ref or estimate based on device
    const containerWidth = tagCloudRef.current?.clientWidth || 
      (isSmallMobile ? 300 : isMobile ? 400 : 600);
    // logWithTime(`Container width: ${containerWidth}px`);
    
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

  // Add a specific useEffect for handling the "All" category height
  useEffect(() => {
  // Add a console log to confirm the effect is running
  console.log("Category changed to:", selectedCategory);
  
  // Add a small delay to ensure the DOM is ready
  const timer = setTimeout(() => {
    if (tagCloudRef.current) {
      console.log("Setting height for", selectedCategory);
      
      // Force a specific height for the "All" category
      if (selectedCategory === 'All') {
        console.log("Setting All category height to 800px");
        tagCloudRef.current.style.height = '800px';
      } else {
        // For other categories, calculate based on content
        console.log("Calculating height for category:", selectedCategory);
        const containerWidth = tagCloudRef.current.clientWidth;
        const rows = organizeTagsIntoRows(categoryTags, containerWidth);
        const calculatedHeight = calculateCloudHeight(rows);
        const minHeight = getMinCloudHeight();
        const finalHeight = Math.max(calculatedHeight, minHeight);
        
        console.log(`Setting ${selectedCategory} height to ${finalHeight}px`);
        tagCloudRef.current.style.height = `${finalHeight}px`;
      }
    } else {
      console.warn("tagCloudRef.current is null");
    }
  }, 200); // 200ms delay to ensure DOM is updated
  
  return () => clearTimeout(timer);
}, [selectedCategory, categoryTags, organizeTagsIntoRows, calculateCloudHeight, getMinCloudHeight]);

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

  // const getButtonTextSize = useCallback(() => {
  //   if (isSmallMobile) {
  //     return '0.8rem'; // Smallest text for small phones
  //   } else if (isMobile) {
  //     return '0.85rem'; // Medium text for tablets/larger phones
  //   }
    
  //   // Original desktop size
  //   return '1rem';
  // }, [isMobile, isSmallMobile]);
  
  // 5. Add a function to calculate button padding based on screen size
  // const getButtonPadding = useCallback(() => {
  //   if (isSmallMobile) {
  //     return '0.35rem 0.6rem'; // Smallest padding for small phones
  //   } else if (isMobile) {
  //     return '0.45rem 0.8rem'; // Medium padding for tablets/larger phones
  //   }
    
  //   // Original desktop size
  //   return '0.6rem 1rem';
  // }, [isMobile, isSmallMobile]);

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
  //  const calculateTagCloudHeight = () => {
  //    // Base height calculations adjusted for potentially longer tag text
  //    const baseHeight = isSmallMobile ? 320 : isMobile ? 360 : 400; 
  //    const heightPerTag = isSmallMobile ? 30 : isMobile ? 35 : 40;
      
  //    // Increase height factor for more tags to account for potentially longer text
  //    const additionalHeightFactor = 0.5; // Increased from 0.25 to 0.5
      
  //    const neededHeight = Math.min(
  //      baseHeight + (categoryTags.length > 20 ? 
  //        (categoryTags.length - 20) * heightPerTag * additionalHeightFactor : 0),
  //      isSmallMobile ? 600 : isMobile ? 700 : 800 // Maximum height increased
  //    );
      
  //    setTagCloudHeight(`${neededHeight}px`);
  //  };
    
  //  calculateTagCloudHeight();
  }, [categoryTags, isMobile, isSmallMobile]);

  // Calculate how many category buttons can fit - with throttling to improve performance
  useEffect(() => {
    const calculateVisibleCategories = () => {
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
      }
      
      throttleTimeout.current = setTimeout(() => {
        if (categoriesContainerRef.current) {
          const containerWidth = categoriesContainerRef.current.offsetWidth;
          
          // More accurate button width calculation including gap
          const buttonGap = parseFloat(isSmallMobile ? '0.2rem' : isMobile ? '0.3rem' : '0.8rem') * 16;
          const avgButtonWidth = isSmallMobile ? 60 : isMobile ? 80 : 100;
          const buttonWithGap = avgButtonWidth + buttonGap;
          
          // Always reserve space for the scroll button
          const scrollButtonWidth = isSmallMobile ? 28 : 40;
          const scrollButtonMargin = 8;
          
          const shouldReserveScrollSpace = categories.length > 5;
          const reservedSpace = shouldReserveScrollSpace ? scrollButtonWidth + scrollButtonMargin : 0;
          
          const availableWidth = containerWidth - reservedSpace;
          
          // Calculate how many buttons can fit
          const buttonsCount = Math.floor(availableWidth / buttonWithGap);
          
          // Ensure at least 2 buttons are shown
          const finalCount = Math.max(2, buttonsCount);
          
          setMaxVisibleCategories(finalCount);

          console.log(`Container width: ${containerWidth}px, buttonWithGap: ${buttonWithGap}px, visibleButtons: ${finalCount}`);          
        }
      }, 150);
    };
    
    calculateVisibleCategories();
    window.addEventListener('resize', calculateVisibleCategories);
    
    if (categories.length > 0) {
      calculateVisibleCategories();
    }
    
    return () => {
      window.removeEventListener('resize', calculateVisibleCategories);
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
      }
    };
  }, [categories, isMobile, isSmallMobile]);

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

        {/* Catego  */}
        <div 
          ref={categoriesContainerRef}
          className="categories-container flex mb-8 relative"
          style={{
            gap: isSmallMobile ? '0.2rem' : isMobile ? '0.3rem' : '0.5rem', // Reduced gap
            overflowX: 'hidden',
            paddingBottom: '4px',
            position: 'relative',
            width: '100%',
            paddingRight: categories.length > maxVisibleCategories ? '45px' : '0', // Make room for scroll button
            justifyContent: (!isMobile && categories.length <= maxVisibleCategories) 
              ? 'space-between' 
              : 'flex-start'
          }}
        >
          {getVisibleCategories().map((category, index) => (
            <button
              key={`${category}-${index}`} // Changed key for stability
              className={`category-button ${selectedCategory === category ? 'active' : ''}`}
              style={{
                fontSize: isSmallMobile ? '0.7rem' : isMobile ? '0.75rem' : '0.85rem',
                padding: isSmallMobile ? '0.3rem 0.5rem' : isMobile ? '0.4rem 0.6rem' : '0.5rem 0.8rem',
                minHeight: '32px',
                minWidth: isSmallMobile ? '50px' : isMobile ? '70px' : '90px', // Reduced min width
                maxWidth: isSmallMobile ? '100px' : isMobile ? '120px' : '140px', // Reduced max width
                flex: '1 0 auto', 
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 0,
                backgroundColor: '#14294f',
                color: 'white',
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
              className="scroll-button"
              style={{
                padding: isSmallMobile ? '0.2rem' : '0.3rem',
                width: isSmallMobile ? '28px' : '40px',
                height: isSmallMobile ? '28px' : '40px',
                minWidth: isSmallMobile ? '28px' : '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                flexShrink: 0,
                border: '1px solid #0a1c38',
                marginLeft: '8px',
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(calc(-50% + 2px))',
                zIndex: 10,
                backgroundColor: isScrollButtonHovered ? '#1e3a8a' : '#14294f', // Darker blue on hover
                color: isScrollButtonHovered ? '#ffffff' : '#ffffff', // Could change text color too
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onClick={shiftCategories}
              onMouseEnter={() => setIsScrollButtonHovered(true)}
              onMouseLeave={() => setIsScrollButtonHovered(false)}
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
                // Flatten all tags from all rows into a single array and render them
                tagRows.flatMap(row => row.tags).map((tag, index) => {
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