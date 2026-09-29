// this file contains the full code of the B+ tree from scratch.

#include<bits/stdc++.h>
using namespace std;

constexpr int order = 2; // this is a constexpr bcoz it need to be avaliable at compile time to also intialize the int arrays.


// constraints of our B+tree.
// 1. all the leaf nodes are in the same level.
// 2. execpt the root node each other node must have no of keys in range order - 2*order and the pointers order+1 - 2*order+1.
// 3. we are taking < and >= for the key all the keys to the left of ckey must be < ckey and all the keys to the right of ckey can be >= ckey.


// we get the value of isLeaf from the node from which it is split.
// else we will get the isLeaf when we create the node for the first time.
struct Node{
    int keys[2*order+1]{}; // this +1 is used to insert the extra element and do the splitting in the same place // this {} will initialize the arrays with zeroes.
    Node* pointers[2*order+2]{}; // this {} will initialize the array with null pointers.
    bool isLeaf = true;
    int numKeys = 0;
    //node* nextLeaf; not using for now
};

Node* root = nullptr; // nullptr says that this ptr points to no object.

int findIdx(int start, int end, int insVal, int keys[]){
    while(start<=end){
        int mid = (start)+(end-start)/2;
        if(keys[mid]<=insVal){
            start = mid+1;
        }else{
            end = mid-1;
        }
    }
    return start;    
}

Node* initNode(int insVal){
    Node* currNode = new Node{}; // this new Node{} returns a pointer object
    currNode->keys[0] = insVal;
    currNode->numKeys = 1;
    return currNode;
}

Node* initNode(Node* node, int start, int end){
    Node* currNode = new Node{};
    for(int i=start;i<=end;i++){
        currNode->keys[i-start] = node->keys[i];
        currNode->numKeys = currNode->numKeys+1;
    }
    // lets also initialize the pointers
    for(int i=start;i<=end+1;i++){
        currNode->pointers[i-(start)] = node->pointers[i];
    }
    return currNode;
}

// this function takes the new sibling node created and current node being split and then retruns the number which goes up and also modifies both the split node and the sibling node
void insertIntoNode(Node& node, int insVal, int insertionIdx, Node* pointer){
    // 0 to mid-1 left split node and mid to 2*order-1 in the newsibling we also have a copy of the node beign taken up as this is leaf split
   
    // need to place all of them in here and 
    int idx = insertionIdx==-1?findIdx(0,node.numKeys-1,insVal,node.keys):insertionIdx;
    for(int i=node.numKeys-1;i>=idx;i--){
        node.keys[i+1] = node.keys[i];
    }
    for(int i=node.numKeys;i>=idx+1;i--){
        node.pointers[i+1] = node.pointers[i];
    }
    if(pointer!=nullptr){
        node.pointers[idx+1] = pointer;
    }
    node.keys[idx] = insVal;
    ++node.numKeys;

}

void cleanUpStale(Node& node, int start, int end){
    for(int i=start;i<=end;i++){
        node.keys[i] = 0;
    }
    return;
}



// insertion algo (B+ tree)
// using just a Node* currNode we can change the values at the actual position of the pointer but we cant change the pointer value itself so we need *& to modify the pointer itself when the tree itself is empty in the begining.
pair<int, Node*> insert(Node*& currNode, int insVal){
    //if there are no nodes  in the tree
    if(currNode==nullptr){
        currNode = initNode(insVal);
        return {0,nullptr};
    }

    Node& node = *currNode; 

    // this if case handles the case there is only node and i.e root and it is split
    if(node.isLeaf==true && root==currNode){
        if(node.numKeys < order*2){
            insertIntoNode(node,insVal,-1,nullptr);
            return {0,nullptr};
        }

        insertIntoNode(node,insVal,-1,nullptr);

        int upMid = node.numKeys/2;
        Node* newRoot = initNode(node.keys[upMid]);
        Node* newSibling = initNode(currNode,upMid,2*order);

        cleanUpStale(node,upMid,2*order);

        node.numKeys = upMid;
        newRoot->isLeaf = false;
        newRoot->pointers[0] = currNode;
        newRoot->pointers[1] = newSibling;
        root = newRoot;

        return {0,nullptr};
    }

    // we need to handle general insertion and recursive splitting

    // we need to recrusively go to the leaf node where we want to insert our value no splitting will handle the recurisve splitting later
    if(node.isLeaf==true){
        // the single condition is sufficient enough
        // if it has space we will insert the element
        if(node.numKeys<2*order){
            // we can insert
            insertIntoNode(node,insVal,-1,nullptr);

            return {0,nullptr};
        }
        // no space // this is the general case need to split

        insertIntoNode(node,insVal,-1,nullptr);

        int upMid = node.numKeys/2;
        Node* newSibling = initNode(currNode,upMid,2*order);
        newSibling->isLeaf = true;
        cleanUpStale(node,upMid,2*order);

        node.numKeys = upMid;
        return {newSibling->keys[0],newSibling};
    }

    // now need to handle the case when we need to handle recursive calls
    // not a leaf not a root and a leaf at the same time so basically called internal node
    // so i need to find the index and then go recurse
    int recIdx = findIdx(0,node.numKeys-1,insVal,node.keys);
    // obviously we need to insert the new value in the leaf level not in the internal node, we insert in the internal node only the searching values
    auto[retInsVal, retNode] = insert(node.pointers[recIdx],insVal);
    if(retNode!=nullptr){
        // it is split and we need to handle the case
        // we need to attach the returned sibling from just next level the think of the rest
        // if we can accomodate we will accomodate the new sibling and the insVal
        if(node.numKeys < 2*order){
            // we need to insert at recIdx
            insertIntoNode(node,retInsVal,recIdx,retNode);
            // our node does not already have the key we are inserting bcoz we are not handling duplicates in this case
            // now we need to return null ptr
            return {0,nullptr};
        }
        // if we dont have the space we need to split this node too
        // just insert the key and the child pointer we get we then shift from the mid to last to another node and return it
        insertIntoNode(node,retInsVal,recIdx,retNode);
        int upMid = node.numKeys/2;
        int newInsVal = node.keys[upMid];
        // now lets create another node
        Node* newSibling = initNode(currNode,upMid+1,2*order);
        newSibling->isLeaf = false;
        // now need to reset the nuKeys of node to recIdx;
        node.numKeys = upMid; // the later will become stale

        if(currNode==root){
            Node* newRoot = initNode(newInsVal);
            newRoot->isLeaf = false;
            newRoot->pointers[0] = currNode;
            newRoot->pointers[1] = newSibling;
            root = newRoot;
            return {0, nullptr};
        }
        return {newInsVal,newSibling};
    }

    return {0,nullptr};


}

void printTree(Node* root){
    // the root itself is sufficient to print the entire tree.
    deque<Node*> dq;
    if(root==nullptr)return;

    dq.push_back(root);

    while(dq.size()>0){
        int dqSiz = dq.size();
        for(int i=0;i<dqSiz;i++){
            Node* currNode = dq.front();
            dq.pop_front();
            //iterate on pointers of current node and add if not null
            for(int j=0;j<=currNode->numKeys;j++){
                if(currNode->pointers[j]!=nullptr)
                dq.push_back(currNode->pointers[j]);
            }
            for(int j=0;j<currNode->numKeys;j++){
                cout<<currNode->keys[j]<<" ";
            }
            cout<<"--";
        }
        cout<<"\n";
        
    }
    return;

}


int main(){

    for(int i=20;i<33;i++){
        insert(root,i);
    }

    printTree(root);

    return 0;
}