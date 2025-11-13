import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type SearchBarProps = {
  onSearch: (query: string) => void;
  onFilter: () => void;
  placeholder?: string;
  showFilterButton?: boolean;
  suggestedSearches?: string[];
};

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onFilter,
  placeholder = 'Search activities...',
  showFilterButton = true,
  suggestedSearches = ['Yoga', 'Coffee', 'Running', 'Art', 'Music', 'Food'],
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    onSearch(searchQuery);
  };

  const handleSuggestionPress = (suggestion: string) => {
    handleSearch(suggestion);
    setFocused(false);
  };

  const clearSearch = () => {
    setQuery('');
    onSearch('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, focused && styles.searchBarFocused]}>
          <Ionicons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
          
          <TextInput
            style={styles.searchInput}
            placeholder={placeholder}
            value={query}
            onChangeText={handleSearch}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholderTextColor="#9CA3AF"
          />
          
          {query.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>

        {showFilterButton && (
          <TouchableOpacity style={styles.filterButton} onPress={onFilter}>
            <Ionicons name="options" size={20} color="#2C7BF6" />
          </TouchableOpacity>
        )}
      </View>

      {focused && suggestedSearches.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Popular searches</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsScrollView}
          >
            {suggestedSearches.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionChip}
                onPress={() => handleSuggestionPress(suggestion)}
              >
                <Ionicons name="trending-up" size={14} color="#6B7280" />
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  searchBarFocused: {
    borderColor: '#2C7BF6',
    backgroundColor: 'white',
    shadowColor: '#2C7BF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  clearButton: {
    padding: 4,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EBF4FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  suggestionsScrollView: {
    paddingRight: 16,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  suggestionText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 4,
  },
});

export default SearchBar;
