CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -Iinclude

all:
	mkdir -p build
	mkdir -p bin

	$(CXX) $(CXXFLAGS) -c src/main.cpp -o build/main.o
	$(CXX) $(CXXFLAGS) -c src/search.cpp -o build/search.o

	$(CXX) bulid/main.o build/search.o -o bin/search
