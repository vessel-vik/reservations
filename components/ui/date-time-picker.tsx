"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { TimeSlots } from "@/constants"

interface DateTimePickerProps {
  date: Date | undefined
  onDateTimeChange: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  className?: string
}

export function DateTimePicker({
  date,
  onDateTimeChange,
  placeholder = "Pick a date and time",
  disabled,
  minDate,
  maxDate,
  className
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [selectedTime, setSelectedTime] = React.useState<string>("")
  
  // Initialize selected time when date changes
  React.useEffect(() => {
    if (date && !selectedTime) {
      const hours = date.getHours()
      const minutes = date.getMinutes()
      const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      setSelectedTime(formattedTime)
    }
  }, [date, selectedTime])

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      // If we have a selected time, apply it to the new date
      if (selectedTime) {
        const [hours, minutes] = selectedTime.split(':').map(Number)
        newDate.setHours(hours, minutes, 0, 0)
      }
      onDateTimeChange(newDate)
    } else {
      onDateTimeChange(undefined)
    }
  }

  const handleTimeSelect = (timeSlot: string) => {
    // Extract time from slot like "8:00 AM" -> "08:00"
    const [time, period] = timeSlot.split(' ')
    const [hours, minutes] = time.split(':').map(Number)
    let adjustedHours = hours
    
    if (period === 'PM' && hours !== 12) {
      adjustedHours += 12
    } else if (period === 'AM' && hours === 12) {
      adjustedHours = 0
    }
    
    const formattedTime = `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    setSelectedTime(formattedTime)
    
    // Apply time to current date or create new date
    const newDate = date ? new Date(date) : new Date()
    newDate.setHours(adjustedHours, minutes, 0, 0)
    onDateTimeChange(newDate)
    setIsOpen(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal border border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/50 text-white rounded-xl h-11",
            !date && "text-gray-400",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-amber-500" />
          {date ? (
            <span className="flex items-center gap-2">
              {format(date, "PPP")}
              <Clock className="h-3 w-3 text-amber-400" />
              {format(date, "h:mm aa")}
            </span>
          ) : (
            placeholder
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-0 bg-slate-900 border-slate-700/50"
        align="start"
        side="bottom"
        sideOffset={5}
      >
        <div className="flex">
          {/* Calendar Section */}
          <div className="p-3 border-r border-slate-700/50">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              disabled={(date) =>
                (minDate && date < minDate) ||
                (maxDate && date > maxDate) ||
                disabled
              }
              initialFocus
              className="rounded-md"
            />
          </div>
          
          {/* Time Selection Section */}
          <div className="p-3 w-48">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                <Clock className="h-4 w-4 text-amber-500" />
                Select Time
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {TimeSlots.map((timeSlot) => (
                  <button
                    key={timeSlot}
                    type="button"
                    onClick={() => handleTimeSelect(timeSlot)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                      "hover:bg-amber-500/10 hover:text-amber-400",
                      "text-gray-300 bg-transparent",
                      date && format(date, "h:mm aa") === timeSlot && 
                      "bg-amber-500/20 text-amber-400 font-medium"
                    )}
                  >
                    {timeSlot}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}