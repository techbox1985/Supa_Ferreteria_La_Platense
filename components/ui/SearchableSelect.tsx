import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from './Icon';

interface Option {
  value: string;
  label: string;
  searchText?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Seleccione una opción...",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => options.find(opt => opt.value === value), [options, value]);
  const selectedLabel = selectedOption ? selectedOption.label : '';

  const [searchTerm, setSearchTerm] = useState(selectedLabel);
  const [prevSelectedLabel, setPrevSelectedLabel] = useState(selectedLabel);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (selectedLabel !== prevSelectedLabel || isOpen !== prevIsOpen) {
    setPrevSelectedLabel(selectedLabel);
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setSearchTerm(selectedLabel);
    }
  }


  const filteredOptions = useMemo(() => {
    // If the search term is exactly the selected label, show all options to allow re-selection.
    // Otherwise, filter based on the user's input.
    if (!searchTerm || (selectedOption && searchTerm === selectedOption.label)) {
        return options;
    }
    return options.filter(option =>
      (option.searchText ?? option.label).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm, selectedOption]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // The useEffect depending on `isOpen` will handle resetting the search term.
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef, selectedOption]);

  const handleSelectOption = (option: Option) => {
    onChange(option.value);
    setSearchTerm(option.label);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (!isOpen) {
        setIsOpen(true);
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <input
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:bg-gray-100"
        />
         <span className="absolute inset-y-0 right-0 flex items-center pr-2">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="text-gray-400">
                <Icon path="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" className="w-5 h-5"/>
            </button>
        </span>
      </div>
      {isOpen && (
        <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
          {filteredOptions.length > 0 ? (
            filteredOptions.map(option => (
              <li
                key={option.value}
                onClick={() => handleSelectOption(option)}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${value === option.value ? 'bg-blue-100 font-semibold' : ''}`}
              >
                {option.label}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-gray-500">No se encontraron resultados</li>
          )}
        </ul>
      )}
    </div>
  );
};