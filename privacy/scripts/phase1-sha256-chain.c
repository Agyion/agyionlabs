/* GPL-3.0-or-later. Public-beacon SHA256 chain; no skipped rounds or cached result.
 * After the first arbitrary-length input, every input is exactly32 bytes. Use
 * OpenSSL's standard SHA256 compression with that fixed, standard padding.
 */
#include <openssl/sha.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

static int digit(char c) {
    if(c>='0'&&c<='9')return c-'0';
    if(c>='a'&&c<='f')return c-'a'+10;
    return -1;
}
int main(int argc,char **argv) {
    if(argc!=3)return 2;
    size_t chars=strlen(argv[1]);
    if(chars==0||chars%2||chars>510)return 2;
    unsigned char input[255],digest[32],block[64]={0};
    for(size_t i=0;i<chars/2;i++){
        int a=digit(argv[1][2*i]),b=digit(argv[1][2*i+1]);
        if(a<0||b<0)return 2;
        input[i]=(unsigned char)((a<<4)|b);
    }
    for(size_t i=0;i<strlen(argv[2]);i++)if(argv[2][i]<'0'||argv[2][i]>'9')return 2;
    char *end;errno=0;unsigned long long rounds=strtoull(argv[2],&end,10);
    if(errno||*end||rounds<1||rounds>UINT64_C(2147483648))return 2;
    SHA256_CTX initial,current;
    if(!SHA256_Init(&initial))return 3;
    current=initial;
    if(!SHA256_Update(&current,input,chars/2)||!SHA256_Final(digest,&current))return 3;
    memcpy(block,digest,32);block[32]=0x80;block[62]=1; /*32*8 bits, big endian*/
    for(uint64_t round=1;round<rounds;round++){
        current=initial;SHA256_Transform(&current,block);
        for(unsigned i=0;i<8;i++){
            uint32_t word=current.h[i];
            block[4*i]=(unsigned char)(word>>24);block[4*i+1]=(unsigned char)(word>>16);
            block[4*i+2]=(unsigned char)(word>>8);block[4*i+3]=(unsigned char)word;
        }
        if((round&UINT64_C(67108863))==0)fprintf(stderr,"beacon SHA256 rounds=%llu/%llu\n",(unsigned long long)round,rounds);
    }
    for(unsigned i=0;i<32;i++)printf("%02x",block[i]);
    putchar('\n');return 0;
}
