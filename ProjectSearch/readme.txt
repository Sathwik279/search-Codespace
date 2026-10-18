This project is about implementing search on text

My learnings along the way:

1) to compile cpp code g++ filename -o objectfilename
2) to run the exe in linux env is ./filename
3) Ways of reading
    reading in terms of words
    string word;
    while(ifst>>word){
        cout<<word<<" ";
    }

    reading in terms of lines
    string line;
    while(getline(ifst,line)){
        cout<<line<<"\n";
    }

4) Understanding creating header files??
    header file consists of declarations


5) we place the object files in the build folder
6) we will place the executable files in teh bin folder
7) makefile is used to write scripts which reduce command line redundancy


order now in this folder structure
--> compile all the files in the src folder
    g++ -c src/main.cpp -o build/main.o
    g++ -c src/search.cpp -o build/search.o
    // the above two lines only work for compilation when we only have standard headers
    g++ -Iinclude -c src/main.cpp -o build/main.o
    g++ -Iinclude -c src/search.cpp -o build/search.o 
    // the above two can be used if we have our own custom headers in the include folder


    
--> now link all the object files in build generated from compilation
    a single exe is created
    g++ build/main.o build/search.o -o bin/search
    or simply g++ build/*.o -o bin/search
--> now run the exe file generated in the bin folder

8) Understanding Syntax of makefile
    --> Syntax
    target:
        command 
    example:

        hello:
            echo Hello World
        // now when i run 
        make hello // this outputs Hello World

    --> variables
    example:
    CXX = g++
    build:
        $(CXX) src/main.cpp -o search

    we need
    --compilation
    --linking to create teh exe file
    -- running the exe file
    --cleaning the bin files

    $< tells first dependency $@ tells the target
    ex:
    build/main.o: src/main.cpp
        g++ -c $< -o $@ 
    the above expands to 
    g++ -c src/main.cpp -o build/main.o 

    --> pattern rules
    build/%.o: src/%.cpp
        g++ $(CXXFLAGS) -c $< -o $@
    // now this code will compile all teh files in the src folder and creates the object files 
