import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  isLoading = false,
  ...props 
}) => {
  const baseStyles = "w-full py-3 rounded-lg font-bold transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 border";
  
  const variants = {
    primary: "bg-[#8B0000] hover:bg-[#7a0000] text-[#fff8ea] shadow-md border-[#5c0000]",
    secondary: "bg-[#d6cda4] hover:bg-[#c5bb8f] text-[#450a0a] border-[#b0a680]",
    danger: "bg-red-100 text-red-800 border-red-200 hover:bg-red-200",
    ghost: "bg-transparent text-[#8B0000] hover:bg-[#8B0000]/10 border-transparent",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="animate-pulse">处理中...</span>
      ) : children}
    </button>
  );
};