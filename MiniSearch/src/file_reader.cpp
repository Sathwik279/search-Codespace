#include "file_reader.h"
#include <fstream>
#include <iostream>
using namespace std;

void print_file(const string& filename){
   
    ifstream ifst {filename}; // this is an input stream for the file named iname
    if(!ifst){
        throw runtime_error("cant open file"+iname);
    }
    cout<<"successfully opened for reading";

    // now lets print on console what is read from the file

    string word;
    while(ifst>>word){
        cout<<word<<" ";
    }

}